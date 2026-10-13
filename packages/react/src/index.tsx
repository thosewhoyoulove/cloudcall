import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AgentPresence, CallHandle, CallSnapshot, CloudCallSDK } from '@cloudcall/core';

const Context = createContext<CloudCallSDK | null>(null);
export function CloudCallProvider({ sdk, children }: { sdk: CloudCallSDK; children: ReactNode }) {
  useEffect(
    () => () => {
      void sdk.destroy();
    },
    [sdk],
  );
  return <Context.Provider value={sdk}>{children}</Context.Provider>;
}
export function useCloudCall(): CloudCallSDK {
  const sdk = useContext(Context);
  if (!sdk) throw new Error('CloudCallProvider is missing');
  return sdk;
}
export function useCallList(): CallSnapshot[] {
  const sdk = useCloudCall();
  const [calls, setCalls] = useState(() => sdk.getCalls());
  useEffect(() => {
    const sync = () => setCalls(sdk.getCalls());
    const off1 = sdk.on('call:created', sync);
    const off2 = sdk.on('call:updated', sync);
    sync();
    return () => {
      off1();
      off2();
    };
  }, [sdk]);
  return calls;
}
export function useCall(call: CallHandle): CallSnapshot {
  const [snapshot, setSnapshot] = useState(() => call.getSnapshot());
  useEffect(() => call.subscribe(setSnapshot), [call]);
  return snapshot;
}
export function useAgentPresence(): AgentPresence {
  const sdk = useCloudCall();
  const [presence, setPresence] = useState(() => sdk.getAgentPresence());
  useEffect(() => sdk.on('agent:presence', (event) => setPresence(event.presence)), [sdk]);
  return presence;
}
