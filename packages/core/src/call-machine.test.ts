import { describe, expect, it } from 'vitest';
import { transition } from './call-machine';
import type { CallSnapshot } from './types';
const base: CallSnapshot = {
  id: 'c1',
  phoneNumber: '10086',
  direction: 'outbound',
  state: 'connecting',
  muted: false,
  startedAt: 1,
  revision: 0,
};
describe('call state machine', () => {
  it('makes local hangup win over a late accepted event', () => {
    const ended = transition(base, { type: 'HANGUP' }, 2);
    expect(transition(ended, { type: 'REMOTE_ACCEPTED' }, 3)).toBe(ended);
  });
  it('drops stale sequenced events', () => {
    const active = transition(base, { type: 'REMOTE_ACCEPTED', sequence: 2 }, 2);
    expect(transition(active, { type: 'NETWORK_LOST', sequence: 1 }, 3)).toBe(active);
  });
  it('rejects illegal transitions', () => {
    expect(() => transition(base, { type: 'HOLD' })).toThrow(/Cannot apply HOLD/);
  });
  it('treats repeated hangup as idempotent', () => {
    const ended = transition(base, { type: 'HANGUP' });
    expect(transition(ended, { type: 'HANGUP' })).toBe(ended);
  });
});
