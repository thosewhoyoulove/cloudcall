import { onUnmounted, readonly, shallowRef } from 'vue';
import type { CloudCallSDK } from '@cloudcall/core';

export function useCloudCall(sdk: CloudCallSDK) {
  const state = shallowRef(sdk.getState());
  const calls = shallowRef(sdk.getCalls());
  const presence = shallowRef(sdk.getAgentPresence());
  const cleanups = [
    sdk.on('sdk:state', (value) => {
      state.value = value;
    }),
    sdk.on('call:created', () => {
      calls.value = sdk.getCalls();
    }),
    sdk.on('call:updated', () => {
      calls.value = sdk.getCalls();
    }),
    sdk.on('agent:presence', (event) => {
      presence.value = event.presence;
    }),
  ];
  onUnmounted(() => cleanups.forEach((cleanup) => cleanup()));
  return { state: readonly(state), calls: readonly(calls), presence: readonly(presence) };
}
