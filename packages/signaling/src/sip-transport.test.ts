import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createCloudCall } from '@cloudcall/core';
import { SipTransport } from './sip-transport';

// Adapter contract tests only: these do not simulate network SIP interoperability.
const fake = vi.hoisted(() => {
  class Emitter {
    listeners: Array<(state: string) => void> = [];
    addListener(listener: (state: string) => void) {
      this.listeners.push(listener);
    }
    emit(state: string) {
      this.listeners.forEach((listener) => listener(state));
    }
  }
  class Handler {
    track = { enabled: true };
    localMediaStream = { getAudioTracks: () => [this.track] };
    remoteMediaStream = {};
    peerConnection = {
      connectionState: 'connected' as string,
      listeners: {} as Record<string, () => void>,
      addEventListener: (name: string, listener: () => void) => {
        this.peerConnection.listeners[name] = listener;
      },
      getStats: async () => ({
        forEach(callback: (stat: Record<string, unknown>) => void) {
          callback({
            type: 'inbound-rtp',
            kind: 'audio',
            jitter: 0.02,
            packetsLost: 1,
            packetsReceived: 100,
          });
          callback({
            type: 'candidate-pair',
            state: 'succeeded',
            nominated: true,
            currentRoundTripTime: 0.05,
          });
        },
      }),
    };
    sendDtmf = vi.fn(() => true);
  }
  class Session {
    state = 'Initial';
    stateChange = new Emitter();
    sessionDescriptionHandler = new Handler();
    remoteIdentity = { uri: { user: '1002' } };
    setState(state: string) {
      this.state = state;
      this.stateChange.emit(state);
    }
    bye = vi.fn(async () => {
      this.setState('Terminated');
    });
    refer = vi.fn(async () => {
      throw new Error('REFER was not expected');
    });
    cancel = vi.fn(async () => {
      this.setState('Terminated');
    });
    reject = vi.fn(async () => {
      this.setState('Terminated');
    });
    accept = vi.fn(async () => {
      this.setState('Established');
    });
    inviteOptions:
      | {
          requestDelegate?: {
            onProgress?: (response: { message: { statusCode: number } }) => void;
            onReject?: (response: { message: { statusCode: number } }) => void;
          };
        }
      | undefined;
    invite = vi.fn(async (options = {}) => {
      this.inviteOptions = options;
    });
  }
  const state: {
    agent?: Agent;
    outgoing?: Inviter;
    rejectedRegistration: boolean;
    inviterOptions?: unknown;
  } = {
    rejectedRegistration: false,
  };
  class Agent {
    constructor(
      readonly options: {
        delegate: { onInvite: (invitation: Invitation) => void; onDisconnect: () => void };
      },
    ) {
      state.agent = this;
    }
    static makeURI(value: string) {
      const match = /^sip:([^@]+)@([^@]+)$/.exec(value);
      return match ? { scheme: 'sip', host: match[2] } : undefined;
    }
    start = vi.fn(async () => {});
    stop = vi.fn(async () => {});
  }
  class Registerer {
    stateChange = new Emitter();
    register = vi.fn(
      async (options: {
        requestDelegate: {
          onAccept: () => void;
          onReject: (response: { message: { statusCode: number } }) => void;
        };
      }) => {
        if (state.rejectedRegistration)
          options.requestDelegate.onReject({ message: { statusCode: 403 } });
        else {
          this.stateChange.emit('Registered');
          options.requestDelegate.onAccept();
        }
      },
    );
  }
  class Inviter extends Session {
    constructor(...args: unknown[]) {
      super();
      state.outgoing = this;
      state.inviterOptions = args[2];
    }
  }
  class Invitation extends Session {}
  class Audio {
    autoplay = false;
    srcObject: unknown;
    play = vi.fn(async () => {});
    pause = vi.fn();
  }
  return { state, Agent, Registerer, Inviter, Invitation, Handler, Audio };
});
vi.mock('sip.js', () => ({
  UserAgent: fake.Agent,
  Registerer: fake.Registerer,
  Inviter: fake.Inviter,
  Invitation: fake.Invitation,
  RegistererState: { Registered: 'Registered' },
  SessionState: {
    Initial: 'Initial',
    Establishing: 'Establishing',
    Established: 'Established',
    Terminated: 'Terminated',
    Terminating: 'Terminating',
  },
  Web: {
    SessionDescriptionHandler: fake.Handler,
    defaultSessionDescriptionHandlerFactory: () => () => new fake.Handler(),
  },
}));

describe('SIP adapter contract', () => {
  beforeEach(() => {
    fake.state.rejectedRegistration = false;
    delete fake.state.outgoing;
    delete fake.state.inviterOptions;
    vi.stubGlobal('window', { isSecureContext: true });
    vi.stubGlobal('Audio', fake.Audio);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  function fixture() {
    const load = vi.fn(async () => ({
      server: 'wss://pbx.example.com/ws',
      aor: 'sip:1001@pbx.example.com',
      authorizationUsername: '1001',
      authorizationPassword: 'secret',
      iceServers: [],
    }));
    const sip = new SipTransport(load);
    const sdk = createCloudCall({
      transport: sip,
      media: sip,
      host: { getAccessToken: async () => '' },
      config: { maxConcurrentCalls: 1 },
    });
    return { sip, sdk, load };
  }
  it('refreshes TURN credentials for each call and blocks calls after login expires', async () => {
    const { sdk, load } = fixture();
    try {
      await sdk.init();
      load.mockRejectedValueOnce(new Error('登录已过期'));
      await expect(sdk.dial({ phoneNumber: '1002' })).rejects.toThrow('登录已过期');
      expect(load).toHaveBeenCalledTimes(2);
      expect(fake.state.outgoing).toBeUndefined();
    } finally {
      await sdk.destroy();
    }
  });
  it('rejects denied registrations and closes the agent', async () => {
    fake.state.rejectedRegistration = true;
    const { sip, sdk } = fixture();
    await expect(sdk.init()).rejects.toThrow('403');
    expect(sdk.getState()).toBe('failed');
    expect(sip.isRegistered()).toBe(false);
    expect(fake.state.agent?.stop).toHaveBeenCalled();
    await sdk.destroy();
  });
  it('maps ringing once, attaches remote audio, mutes the sending track and hangs up', async () => {
    const { sip, sdk } = fixture();
    try {
      await sdk.init();
      const call = await sdk.dial({ phoneNumber: '1002' });
      const session = fake.state.outgoing!;
      session.inviteOptions?.requestDelegate?.onProgress?.({ message: { statusCode: 180 } });
      session.inviteOptions?.requestDelegate?.onProgress?.({ message: { statusCode: 180 } });
      expect(call.getSnapshot().state).toBe('ringing');
      session.setState('Established');
      await Promise.resolve();
      expect(call.getSnapshot().state).toBe('active');
      expect(sip.diagnostics().activeStreams).toBe(1);
      await call.mute();
      expect(session.sessionDescriptionHandler.track.enabled).toBe(false);
      await call.sendDtmf('123');
      expect(session.sessionDescriptionHandler.sendDtmf).toHaveBeenCalledWith('123');
      await call.hangup();
      expect(call.getSnapshot().endReason).toBe('local-hangup');
      expect(session.bye).toHaveBeenCalledTimes(1);
      expect(sip.diagnostics().activeStreams).toBe(0);
    } finally {
      await sdk.destroy();
    }
  });
  it('reports rejected outgoing calls even when SIP terminates before its rejection callback', async () => {
    const { sdk } = fixture();
    const error = vi.fn();
    sdk.on('error', error);
    try {
      await sdk.init();
      const call = await sdk.dial({ phoneNumber: '1002' });
      const session = fake.state.outgoing!;
      session.setState('Terminated');
      session.inviteOptions?.requestDelegate?.onReject?.({ message: { statusCode: 486 } });
      await Promise.resolve();
      expect(call.getSnapshot().state).toBe('failed');
      expect(error.mock.calls[0]?.[0].message).toContain('486');
    } finally {
      await sdk.destroy();
    }
  });
  it('accepts incoming calls and rejects another incoming call while busy', async () => {
    const { sdk } = fixture();
    try {
      await sdk.init();
      const incoming = new fake.Invitation();
      fake.state.agent!.options.delegate.onInvite(incoming);
      const call = sdk.getCall(sdk.getCalls()[0]!.id)!;
      const busy = new fake.Invitation();
      fake.state.agent!.options.delegate.onInvite(busy);
      expect(busy.reject).toHaveBeenCalledWith({ statusCode: 486 });
      await call.accept();
      expect(call.getSnapshot().state).toBe('active');
      incoming.setState('Terminated');
      await Promise.resolve();
      expect(call.getSnapshot().endReason).toBe('remote-hangup');
    } finally {
      await sdk.destroy();
    }
  });
  it('blocks new calls after signaling disconnects', async () => {
    const { sip, sdk } = fixture();
    try {
      await sdk.init();
      fake.state.agent!.options.delegate.onDisconnect();
      expect(sip.isRegistered()).toBe(false);
      await expect(sdk.dial({ phoneNumber: '1002' })).rejects.toThrow('SIP 尚未注册');
      expect(sdk.getCalls()[0]?.state).toBe('failed');
    } finally {
      await sdk.destroy();
    }
  });
  it('ends the call only after a blind REFER is accepted', async () => {
    const { sdk } = fixture();
    try {
      await sdk.init();
      const call = await sdk.dial({ phoneNumber: '1002' });
      const session = fake.state.outgoing!;
      session.setState('Established');
      await Promise.resolve();
      session.refer.mockImplementation(async (_target, options) => {
        options?.requestDelegate?.onAccept?.();
      });
      await call.transfer('1003');
      expect(session.refer).toHaveBeenCalled();
      expect(call.getSnapshot().endReason).toBe('transferred');
      expect(session.bye).toHaveBeenCalled();
    } finally {
      await sdk.destroy();
    }
  });
  it('keeps the call active when the PBX rejects REFER', async () => {
    const { sdk } = fixture();
    try {
      await sdk.init();
      const call = await sdk.dial({ phoneNumber: '1002' });
      const session = fake.state.outgoing!;
      session.setState('Established');
      await Promise.resolve();
      session.refer.mockImplementation(async (_target, options) => {
        options?.requestDelegate?.onReject?.({ message: { statusCode: 603 } });
      });
      await expect(call.transfer('1003')).rejects.toThrow('603');
      expect(call.getSnapshot().state).toBe('active');
      expect(session.bye).not.toHaveBeenCalled();
    } finally {
      await sdk.destroy();
    }
  });
  it('moves an established call through media reconnect and reads WebRTC stats', async () => {
    const { sip, sdk } = fixture();
    try {
      await sdk.init();
      const call = await sdk.dial({ phoneNumber: '1002' });
      const session = fake.state.outgoing!;
      session.setState('Established');
      const peer = session.sessionDescriptionHandler.peerConnection;
      await vi.waitFor(() => {
        expect(peer.listeners.connectionstatechange).toBeTypeOf('function');
      });
      peer.connectionState = 'disconnected';
      peer.listeners.connectionstatechange?.();
      expect(call.getSnapshot().state).toBe('reconnecting');
      peer.connectionState = 'connected';
      peer.listeners.connectionstatechange?.();
      expect(call.getSnapshot().state).toBe('active');
      await expect(sip.getQuality(call.id)).resolves.toMatchObject({
        level: 'good',
        packetsLost: 1,
        packetsReceived: 100,
      });
    } finally {
      await sdk.destroy();
    }
  });
  it('applies the selected microphone on the next invite', async () => {
    const { sip, sdk } = fixture();
    try {
      await sdk.init();
      await sip.setInputDevice('mic-7');
      await sdk.dial({ phoneNumber: '1002' });
      const options = fake.state.inviterOptions as {
        sessionDescriptionHandlerOptions: {
          constraints: { audio: { deviceId: { exact: string } } };
        };
      };
      expect(options.sessionDescriptionHandlerOptions.constraints.audio.deviceId.exact).toBe(
        'mic-7',
      );
    } finally {
      await sdk.destroy();
    }
  });
});
