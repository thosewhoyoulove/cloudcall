import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  SessionState,
  UserAgent,
  Web,
} from 'sip.js';
import type { Session } from 'sip.js';
import type {
  CallEvent,
  Command,
  DialRequest,
  MediaAdapter,
  SignalingTransport,
  TransportEvent,
} from '@cloudcall/core';

export interface SipConfiguration {
  server: string;
  aor: string;
  authorizationUsername: string;
  authorizationPassword: string;
  iceServers: RTCIceServer[];
}

/** SIP.js owns both signaling and media; use this instance for both SDK adapters. */
export class SipTransport implements SignalingTransport, MediaAdapter {
  readonly confirmsCommands = true;
  private agent: UserAgent | undefined;
  private registerer: Registerer | undefined;
  private registered = false;
  private readonly sessions = new Map<string, Session>();
  private readonly audio = new Map<string, HTMLAudioElement>();
  private readonly localEnding = new Set<string>();
  private readonly ringing = new Set<string>();
  private readonly listeners = new Set<(event: TransportEvent) => void>();
  private outputDevice: string | undefined;
  private domain = '';
  private configuration: SipConfiguration | undefined;

  constructor(
    private readonly loadConfiguration: (signal: AbortSignal) => Promise<SipConfiguration>,
  ) {}

  async connect(signal: AbortSignal): Promise<void> {
    await this.disconnect();
    const config = await this.loadConfiguration(signal);
    signal.throwIfAborted();
    if (!window.isSecureContext) throw new Error('真实通话需要 HTTPS 或 localhost');
    if (new URL(config.server).protocol !== 'wss:') throw new Error('SIP 服务必须使用 WSS');
    const uri = UserAgent.makeURI(config.aor);
    if (!uri || uri.scheme !== 'sip') throw new Error('Invalid SIP address');
    this.domain = uri.host;
    this.configuration = config;
    const mediaFactory = Web.defaultSessionDescriptionHandlerFactory();
    const agent = new UserAgent({
      uri,
      authorizationUsername: config.authorizationUsername,
      authorizationPassword: config.authorizationPassword,
      transportOptions: { server: config.server, connectionTimeout: 10, keepAliveInterval: 25 },
      logBuiltinEnabled: false,
      logConfiguration: false,
      sessionDescriptionHandlerFactory: (session, options) =>
        mediaFactory(session, {
          ...options,
          peerConnectionConfiguration: { iceServers: this.configuration?.iceServers ?? [] },
        }),
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionConfiguration: { iceServers: config.iceServers },
      },
      delegate: {
        onInvite: (invitation) => this.receive(invitation),
        onDisconnect: () => {
          this.registered = false;
          for (const id of this.sessions.keys())
            this.fail(id, new Error('SIP 连接已断开，请重新连接'));
        },
      },
    });
    this.agent = agent;
    const abort = () => {
      void agent.stop().catch(() => {});
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      await agent.start();
      signal.throwIfAborted();
      const registerer = new Registerer(agent, { expires: 300, logConfiguration: false });
      this.registerer = registerer;
      registerer.stateChange.addListener((state) => {
        this.registered = state === RegistererState.Registered;
      });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('SIP 注册超时')), 15_000);
        const cancelled = () => finish(new Error('SIP 注册已取消'));
        const finish = (error?: Error) => {
          clearTimeout(timer);
          signal.removeEventListener('abort', cancelled);
          if (error) reject(error);
          else resolve();
        };
        signal.addEventListener('abort', cancelled, { once: true });
        void registerer
          .register({
            requestDelegate: {
              onAccept: () => {
                this.registered = true;
                finish();
              },
              onReject: (response) =>
                finish(new Error(`SIP 注册失败 (${response.message.statusCode})`)),
            },
          })
          .catch((error: unknown) => finish(asError(error)));
      });
      signal.throwIfAborted();
    } catch (error) {
      await this.disconnect();
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  async disconnect(): Promise<void> {
    this.registered = false;
    const agent = this.agent;
    this.agent = undefined;
    this.registerer = undefined;
    try {
      await agent?.stop();
    } finally {
      this.sessions.clear();
      this.localEnding.clear();
      this.ringing.clear();
      for (const element of this.audio.values()) {
        element.pause();
        element.srcObject = null;
      }
      this.audio.clear();
    }
  }

  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async send(command: Command, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (!this.registered || !this.agent) throw new Error('SIP 尚未注册，请重新连接');
    if (command.type === 'dial') {
      await this.refreshConfiguration(signal);
      if (!this.registered || !this.agent) throw new Error('SIP 尚未注册，请重新连接');
      if (this.sessions.size) throw new Error('真实模式目前仅支持一通电话');
      const number = (command.payload as DialRequest).phoneNumber;
      const uri = this.destination(number);
      const session = new Inviter(this.agent, uri, {
        sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
      });
      this.track(command.callId, session);
      try {
        await session.invite({
          requestDelegate: {
            onProgress: (response) => {
              if (response.message.statusCode === 180 && !this.ringing.has(command.callId)) {
                this.ringing.add(command.callId);
                this.event(command.callId, { type: 'REMOTE_RINGING' });
              }
            },
            onReject: (response) =>
              this.fail(command.callId, new Error(`呼叫失败 (${response.message.statusCode})`)),
          },
        });
      } catch (error) {
        this.fail(command.callId, asError(error));
        await this.release(command.callId);
        throw error;
      }
      return;
    }
    const session = this.sessions.get(command.callId);
    if (!session) {
      if (command.type === 'hangup' || command.type === 'reject') return;
      throw new Error('SIP 会话不存在');
    }
    switch (command.type) {
      case 'accept':
        if (!(session instanceof Invitation)) throw new Error('非呼入会话');
        await this.refreshConfiguration(signal);
        await session.accept({
          sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
        });
        break;
      case 'reject':
        if (!(session instanceof Invitation)) throw new Error('非呼入会话');
        this.localEnding.add(command.callId);
        await session.reject();
        break;
      case 'hangup':
        this.localEnding.add(command.callId);
        await this.end(session);
        break;
      case 'hold':
      case 'resume':
        await this.confirmReinvite(session, command.type === 'hold');
        break;
      case 'dtmf': {
        const handler = session.sessionDescriptionHandler;
        if (
          !(handler instanceof Web.SessionDescriptionHandler) ||
          !handler.sendDtmf(String(command.payload))
        )
          throw new Error('当前会话不支持 RTP DTMF');
        break;
      }
      case 'transfer':
        // REFER acceptance alone does not mean the target answered. Expose no false success.
        throw new Error('真实模式暂未开放转接');
    }
  }

  async acquire(_callId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
  }
  async release(callId: string): Promise<void> {
    const session = this.sessions.get(callId);
    try {
      if (session) {
        this.localEnding.add(callId);
        await this.end(session);
      }
    } finally {
      this.sessions.delete(callId);
      const element = this.audio.get(callId);
      if (element) {
        element.pause();
        element.srcObject = null;
        this.audio.delete(callId);
      }
    }
  }
  async setMuted(callId: string, muted: boolean): Promise<void> {
    const handler = this.sessions.get(callId)?.sessionDescriptionHandler;
    if (!(handler instanceof Web.SessionDescriptionHandler)) throw new Error('音频尚未连接');
    handler.localMediaStream.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
  }
  async setOutputDevice(deviceId: string): Promise<void> {
    for (const element of this.audio.values()) {
      if (!('setSinkId' in element)) throw new Error('浏览器不支持切换扬声器');
      await element.setSinkId(deviceId);
    }
    this.outputDevice = deviceId;
  }
  async resumeAudio(): Promise<void> {
    await Promise.all([...this.audio.values()].map((element) => element.play()));
  }
  isRegistered(): boolean {
    return this.registered;
  }
  async destroy(): Promise<void> {
    await this.disconnect();
    this.listeners.clear();
  }
  diagnostics(): { activeStreams: number; mutedStreams: number } {
    let mutedStreams = 0;
    for (const session of this.sessions.values()) {
      const handler = session.sessionDescriptionHandler;
      if (
        handler instanceof Web.SessionDescriptionHandler &&
        handler.localMediaStream.getAudioTracks().some((track) => !track.enabled)
      )
        mutedStreams++;
    }
    return { activeStreams: this.audio.size, mutedStreams };
  }

  private receive(invitation: Invitation): void {
    if (!this.registered || this.sessions.size) {
      void invitation.reject({ statusCode: 486 });
      return;
    }
    const id = crypto.randomUUID();
    this.track(id, invitation);
    this.emit({
      type: 'incoming',
      call: { id, phoneNumber: invitation.remoteIdentity.uri.user ?? '未知号码' },
    });
  }
  private track(id: string, session: Session): void {
    this.sessions.set(id, session);
    session.stateChange.addListener((state) => {
      if (state === SessionState.Established) {
        void this.attachAudio(id, session).catch((error: unknown) => this.fail(id, asError(error)));
        this.event(id, { type: session instanceof Invitation ? 'ACCEPT' : 'REMOTE_ACCEPTED' });
      } else if (state === SessionState.Terminated) {
        // SIP.js transitions to Terminated before calling the rejection delegate.
        // Let a final 4xx/5xx response report its reason before generic termination.
        queueMicrotask(() => {
          this.sessions.delete(id);
          this.ringing.delete(id);
          if (!this.localEnding.delete(id)) this.event(id, { type: 'REMOTE_HANGUP' });
          void this.release(id).catch(() => {});
        });
      }
    });
  }
  private async attachAudio(id: string, session: Session): Promise<void> {
    const handler = session.sessionDescriptionHandler;
    if (!(handler instanceof Web.SessionDescriptionHandler)) throw new Error('WebRTC 媒体未建立');
    const element = new Audio();
    element.autoplay = true;
    element.srcObject = handler.remoteMediaStream;
    this.audio.set(id, element);
    if (this.outputDevice && 'setSinkId' in element) await element.setSinkId(this.outputDevice);
    // Autoplay may require a subsequent user gesture; UI exposes resumeAudio.
    await element.play().catch(() => {});
    handler.peerConnection?.addEventListener('connectionstatechange', () => {
      if (handler.peerConnection?.connectionState === 'failed')
        this.fail(id, new Error('音频连接失败，请检查 TURN 和网络'));
    });
  }
  private async end(session: Session): Promise<void> {
    if (session.state === SessionState.Established) await session.bye();
    else if (
      session.state === SessionState.Terminated ||
      session.state === SessionState.Terminating
    )
      return;
    else if (session instanceof Inviter) await session.cancel();
    else if (session instanceof Invitation) await session.reject();
  }
  private confirmReinvite(session: Session, hold: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('保持/恢复请求超时')), 15_000);
      void session
        .invite({
          sessionDescriptionHandlerOptions: { hold } as Web.SessionDescriptionHandlerOptions,
          requestDelegate: {
            onAccept: () => {
              clearTimeout(timer);
              resolve();
            },
            onReject: () => {
              clearTimeout(timer);
              reject(new Error('服务端拒绝保持/恢复'));
            },
          },
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
  private destination(number: string) {
    if (!/^\+?[0-9*#]{3,20}$/.test(number)) throw new Error('号码格式无效');
    const uri = UserAgent.makeURI(`sip:${encodeURIComponent(number)}@${this.domain}`);
    if (!uri) throw new Error('SIP 目标无效');
    return uri;
  }
  private async refreshConfiguration(signal: AbortSignal): Promise<void> {
    const latest = await this.loadConfiguration(signal);
    signal.throwIfAborted();
    const previous = this.configuration;
    if (
      !previous ||
      latest.server !== previous.server ||
      latest.aor !== previous.aor ||
      latest.authorizationUsername !== previous.authorizationUsername ||
      latest.authorizationPassword !== previous.authorizationPassword
    )
      throw new Error('分机配置已变化，请重新连接');
    this.configuration = latest;
  }
  private fail(id: string, error: Error): void {
    if (this.sessions.has(id) && !this.localEnding.has(id)) this.event(id, { type: 'FAIL', error });
  }
  private event(callId: string, event: CallEvent): void {
    this.emit({ type: 'call-event', callId, event, messageId: crypto.randomUUID() });
  }
  private emit(event: TransportEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
