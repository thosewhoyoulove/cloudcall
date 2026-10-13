import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCloudCall,
  type AgentPresence,
  type AudioDevice,
  type CallHandle,
  type CallQuality,
  type CallSnapshot,
  type ScreenPop,
  type SdkState,
} from '@cloudcall/core';
import type { FaultProfile, SipRegistrationState } from '@cloudcall/signaling';
import { createRuntime, realCalls } from './runtime';
import { messageOf } from './format';

export type LogKind = 'lifecycle' | 'call' | 'state' | 'error' | 'fault' | 'signaling';

export interface WorkbenchLog {
  id: string;
  at: number;
  time: string;
  kind: LogKind;
  message: string;
}

const initialFaults = (): FaultProfile => ({
  latencyMs: 350,
  duplicate: false,
  outOfOrder: false,
  failNext: false,
  offline: false,
});

export function useWorkbench() {
  const [number, setNumber] = useState('13800138000');
  const [state, setState] = useState<SdkState>('created');
  const [calls, setCalls] = useState<CallSnapshot[]>([]);
  const [handles, setHandles] = useState<Map<string, CallHandle>>(() => new Map());
  const [logs, setLogs] = useState<WorkbenchLog[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [faults, setFaults] = useState<FaultProfile>(initialFaults);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presence, setPresence] = useState<AgentPresence>('offline');
  const [desiredPresence, setDesiredPresenceState] = useState<'available' | 'away'>('available');
  const [screenPop, setScreenPop] = useState<ScreenPop | null>(null);
  const [quality, setQuality] = useState<CallQuality | undefined>();
  const [registration, setRegistration] = useState<SipRegistrationState>(
    realCalls ? 'connecting' : 'registered',
  );
  const [devices, setDevices] = useState<readonly AudioDevice[]>([]);
  const [inputDevice, setInputDeviceId] = useState('');
  const [outputDevice, setOutputDeviceId] = useState('');
  const [linkQuality, setLinkQualityState] = useState<'good' | 'fair' | 'poor'>('good');

  const runtime = useMemo(createRuntime, []);
  const { transport, media } = runtime;
  const sdk = useMemo(
    () =>
      createCloudCall({
        transport,
        media,
        host: {
          async getAccessToken() {
            return realCalls ? 'authenticated-session' : 'mock-token';
          },
          track() {},
        },
        recording: {
          async start(call) {
            return { id: `rec-${call.id}` };
          },
          async stop() {},
        },
        config: {
          callTimeoutMs: realCalls ? 45_000 : 15_000,
          maxConcurrentCalls: realCalls ? 1 : 3,
          wrapUpMs: 4_000,
          qualityIntervalMs: 2_000,
        },
      }),
    [media, transport],
  );

  const log = useCallback((kind: LogKind, message: string) => {
    setLogs((current) => {
      const entry: WorkbenchLog = {
        id: crypto.randomUUID(),
        at: Date.now(),
        time: new Date().toLocaleTimeString(),
        kind,
        message,
      };
      return [...current, entry].slice(-200);
    });
  }, []);

  const report = useCallback(
    (caught: unknown) => {
      const message = messageOf(caught);
      setError(message);
      log('error', message);
    },
    [log],
  );

  useEffect(() => {
    const sync = () => setCalls(sdk.getCalls());
    const stops = [
      sdk.on('sdk:state', (value) => {
        setState(value);
        log('lifecycle', value);
        if (value === 'destroyed') {
          setCalls([]);
          setHandles(new Map());
        }
      }),
      sdk.on('error', report),
      sdk.on('call:created', (call) => {
        const handle = sdk.getCall(call.id);
        if (handle) setHandles((current) => new Map(current).set(call.id, handle));
        sync();
        log('call', `${call.direction} ${call.phoneNumber}`);
      }),
      sdk.on('call:updated', (call) => {
        sync();
        log(
          'state',
          `${call.phoneNumber} ${call.state}${call.recording ? ` ${call.recording}` : ''}`,
        );
      }),
      sdk.on('agent:presence', (event) => {
        setPresence(event.presence);
        log('lifecycle', `presence ${event.presence} (${event.reason})`);
      }),
      sdk.on('crm:screen-pop', (pop) => {
        setScreenPop(pop);
        log('call', `screen-pop ${pop.direction} ${pop.phoneNumber}`);
      }),
      sdk.on('call:quality', (sample) => {
        setQuality((current) =>
          current?.level === sample.quality.level &&
          current.packetsLost === sample.quality.packetsLost
            ? current
            : sample.quality,
        );
      }),
      transport.subscribe((event) => {
        if (event.type === 'incoming') log('signaling', `incoming ${event.call.phoneNumber}`);
        else log('signaling', `${event.event.type} ${event.callId.slice(0, 8)}`);
      }),
    ];
    const stopRegistration = runtime.sip?.watchRegistration((value) => {
      setRegistration(value);
      log('signaling', `registration ${value}`);
    });
    void media
      .enumerateDevices?.()
      .then(setDevices)
      .catch(() => {});
    void sdk.init().catch(report);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stops.forEach((stop) => stop());
      stopRegistration?.();
      window.clearInterval(timer);
      void sdk.destroy();
    };
  }, [log, media, report, runtime.sip, sdk, transport]);

  const active = [...calls]
    .reverse()
    .find((call) => call.state !== 'ended' && call.state !== 'failed');
  const activeId = active?.id;
  useEffect(() => {
    setQuality(undefined);
  }, [activeId]);
  const handle = active ? handles.get(active.id) : undefined;
  const latest = calls.length > 0 ? calls[calls.length - 1] : undefined;

  const activeRef = useRef<{ snapshot: CallSnapshot; handle: CallHandle } | null>(null);
  activeRef.current = active && handle ? { snapshot: active, handle } : null;
  const numberRef = useRef(number);
  numberRef.current = number;

  const dial = useCallback(() => {
    setError(null);
    return sdk.dial({ phoneNumber: numberRef.current }).catch(report);
  }, [report, sdk]);

  const pressDigit = useCallback(
    (digit: string) => {
      const live = activeRef.current;
      if (live && (live.snapshot.state === 'active' || live.snapshot.state === 'holding')) {
        return live.handle.sendDtmf(digit).then(
          () => log('signaling', `dtmf ${digit}`),
          (caught: unknown) => {
            report(caught);
            throw caught;
          },
        );
      }
      if (!live) setNumber((value) => `${value}${digit}`.slice(0, 20));
      return Promise.resolve();
    },
    [log, report],
  );

  const backspace = useCallback(() => {
    if (activeRef.current) return;
    setNumber((value) => value.slice(0, -1));
  }, []);

  const toggleMute = useCallback(() => {
    const live = activeRef.current;
    if (!live) return Promise.resolve();
    if (live.snapshot.state !== 'active' && live.snapshot.state !== 'holding')
      return Promise.resolve();
    return live.handle.mute(!live.snapshot.muted).catch(report);
  }, [report]);

  const toggleHold = useCallback(() => {
    const live = activeRef.current;
    if (!live) return Promise.resolve();
    const action = live.snapshot.state === 'holding' ? live.handle.resume() : live.handle.hold();
    return action.catch(report);
  }, [report]);

  const transfer = useCallback(
    (target: string) => {
      const live = activeRef.current;
      if (!live) return Promise.resolve();
      setError(null);
      return live.handle.transfer(target).then(
        () => log('signaling', `transfer ${target}`),
        (caught: unknown) => {
          report(caught);
          throw caught;
        },
      );
    },
    [log, report],
  );

  const patchFaults = useCallback(
    (patch: Partial<FaultProfile>) => {
      if (!runtime.mockTransport) return;
      runtime.mockTransport.configureFaults(patch);
      setFaults({ ...runtime.mockTransport.faults });
      const detail = Object.entries(patch)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ');
      log('fault', detail);
    },
    [log, runtime],
  );

  const setMicDenied = useCallback(
    (value: boolean) => {
      if (!runtime.mockMedia) return;
      runtime.mockMedia.setPermissionDenied(value);
      setPermissionDenied(value);
      log('fault', `microphone=${value ? 'denied' : 'allowed'}`);
    },
    [log, runtime],
  );

  const simulateIncoming = useCallback(() => {
    runtime.mockTransport?.simulateIncoming('4008008888');
  }, [runtime]);

  const remoteHangup = useCallback(() => {
    const live = activeRef.current;
    if (!live) return;
    runtime.mockTransport?.simulateRemoteHangup(live.snapshot.id);
  }, [runtime]);

  const failNext = useCallback(() => {
    if (!runtime.mockTransport) return;
    runtime.mockTransport.configureFaults({ failNext: true });
    setFaults({ ...runtime.mockTransport.faults });
    log('fault', 'failNext');
  }, [log, runtime]);

  const retryInit = useCallback(() => {
    setError(null);
    void sdk.init().catch(report);
  }, [report, sdk]);

  const destroySdk = useCallback(() => {
    return sdk.destroy().catch(report);
  }, [sdk, report]);

  const clearLogs = useCallback(() => setLogs([]), []);
  const dismissError = useCallback(() => setError(null), []);
  const dismissScreenPop = useCallback(() => setScreenPop(null), []);
  const setDesiredPresence = useCallback(
    (next: 'available' | 'away') => {
      setDesiredPresenceState(next);
      try {
        sdk.setAgentPresence(next);
      } catch (caught) {
        report(caught);
      }
    },
    [report, sdk],
  );
  const acceptIncoming = useCallback(() => {
    const live = activeRef.current;
    if (live?.snapshot.state !== 'incoming') return Promise.resolve();
    return live.handle.accept().catch(report);
  }, [report]);
  const rejectIncoming = useCallback(() => {
    const live = activeRef.current;
    if (live?.snapshot.state !== 'incoming') return Promise.resolve();
    return live.handle.reject().catch(report);
  }, [report]);
  const hangupActive = useCallback(() => {
    const live = activeRef.current;
    if (!live || live.snapshot.state === 'incoming') return Promise.resolve();
    if (live.snapshot.state === 'ended' || live.snapshot.state === 'failed')
      return Promise.resolve();
    return live.handle.hangup().catch(report);
  }, [report]);
  const toggleRecording = useCallback(() => {
    const live = activeRef.current;
    if (!live || (live.snapshot.state !== 'active' && live.snapshot.state !== 'holding'))
      return Promise.resolve();
    const action =
      live.snapshot.recording === 'recording'
        ? live.handle.stopRecording()
        : live.handle.startRecording();
    return action.catch(report);
  }, [report]);
  const chooseInput = useCallback(
    (deviceId: string) => {
      setInputDeviceId(deviceId);
      return Promise.resolve(media.setInputDevice?.(deviceId)).catch(report);
    },
    [media, report],
  );
  const chooseOutput = useCallback(
    (deviceId: string) => {
      setOutputDeviceId(deviceId);
      return Promise.resolve(media.setOutputDevice?.(deviceId)).catch(report);
    },
    [media, report],
  );
  const setLinkQuality = useCallback(
    (level: 'good' | 'fair' | 'poor') => {
      runtime.mockMedia?.setQuality(level);
      setLinkQualityState(level);
      log('fault', `quality=${level}`);
    },
    [log, runtime],
  );

  return {
    reportError: report,
    realCalls,
    registered: realCalls ? registration === 'registered' : state === 'ready' && !faults.offline,
    registration,
    presence,
    desiredPresence,
    screenPop,
    quality,
    devices,
    inputDevice,
    outputDevice,
    linkQuality,
    resumeAudio: () => runtime.sip?.resumeAudio().catch(report),
    number,
    setNumber,
    state,
    calls,
    logs,
    now,
    faults,
    permissionDenied,
    error,
    active,
    handle,
    latest,
    diagnostics: sdk.diagnostics(),
    media: media.diagnostics(),
    dial,
    pressDigit,
    backspace,
    toggleMute,
    toggleHold,
    transfer,
    patchFaults,
    setMicDenied,
    simulateIncoming,
    remoteHangup,
    failNext,
    retryInit,
    destroySdk,
    clearLogs,
    dismissError,
    dismissScreenPop,
    setDesiredPresence,
    acceptIncoming,
    rejectIncoming,
    hangupActive,
    toggleRecording,
    chooseInput,
    chooseOutput,
    setLinkQuality,
  };
}

export type Workbench = ReturnType<typeof useWorkbench>;
