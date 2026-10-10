import { bench, describe } from 'vitest';
import { transition } from '@cloudcall/core';
describe('call state hot path', () => {
  bench('connecting → ringing → active', () => {
    const state = {
      id: '1',
      phoneNumber: '10086',
      direction: 'outbound' as const,
      state: 'connecting' as const,
      muted: false,
      startedAt: 0,
      revision: 0,
    };
    const ringing = transition(state, { type: 'REMOTE_RINGING' });
    transition(ringing, { type: 'REMOTE_ACCEPTED' });
  });
});
