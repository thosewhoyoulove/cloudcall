import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createCloudCall,
  type CallHandle,
  type CallSnapshot,
  type SdkState,
} from '@cloudcall/core';
import { MockTransport, type FaultProfile } from '@cloudcall/signaling';
import { MockMediaAdapter } from '@cloudcall/webrtc';
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

  const transport = useMemo(() => new MockTransport(), []);
  const media = useMemo(() => new MockMediaAdapter(), []);
  const sdk = useMemo(
    () =>
      createCloudCall({
        transport,
        media,
        host: {
          async getAccessToken() {
            return 'mock-token';
          },
          track() {},
        },
        config: { callTimeoutMs: 15_000, maxConcurrentCalls: 3 },
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
      sdk.on('call:created', (call) => {
        const handle = sdk.getCall(call.id);
        if (handle) setHandles((current) => new Map(current).set(call.id, handle));
        sync();
        log('call', `${call.direction} ${call.phoneNumber}`);
      }),
      sdk.on('call:updated', (call) => {
        sync();
        log('state', `${call.phoneNumber} ${call.state}`);
      }),
      transport.subscribe((event) => {
        if (event.type === 'incoming') log('signaling', `incoming ${event.call.phoneNumber}`);
        else log('signaling', `${event.event.type} ${event.callId.slice(0, 8)}`);
      }),
    ];
    void sdk.init().catch(report);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stops.forEach((stop) => stop());
      window.clearInterval(timer);
      void sdk.destroy();
    };
  }, [log, report, sdk, transport]);

  const active = [...calls]
    .reverse()
    .find((call) => call.state !== 'ended' && call.state !== 'failed');
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
      transport.configureFaults(patch);
      setFaults({ ...transport.faults });
      const detail = Object.entries(patch)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(' ');
      log('fault', detail);
    },
    [log, transport],
  );

  const setMicDenied = useCallback(
    (value: boolean) => {
      media.setPermissionDenied(value);
      setPermissionDenied(value);
      log('fault', `microphone=${value ? 'denied' : 'allowed'}`);
    },
    [log, media],
  );

  const simulateIncoming = useCallback(() => {
    transport.simulateIncoming('4008008888');
  }, [transport]);

  const remoteHangup = useCallback(() => {
    const live = activeRef.current;
    if (!live) return;
    transport.simulateRemoteHangup(live.snapshot.id);
  }, [transport]);

  const failNext = useCallback(() => {
    transport.configureFaults({ failNext: true });
    setFaults({ ...transport.faults });
    log('fault', 'failNext');
  }, [log, transport]);

  const retryInit = useCallback(() => {
    setError(null);
    void sdk.init().catch(report);
  }, [report, sdk]);

  const destroySdk = useCallback(() => {
    void sdk.destroy();
  }, [sdk]);

  const clearLogs = useCallback(() => setLogs([]), []);
  const dismissError = useCallback(() => setError(null), []);

  return {
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
  };
}

export type Workbench = ReturnType<typeof useWorkbench>;
