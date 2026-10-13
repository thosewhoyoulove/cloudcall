import { CloudCallError, type CallEvent, type CallSnapshot, type CallState } from './types';

const terminal = new Set<CallState>(['ended', 'failed']);
const legal: Record<CallState, ReadonlySet<CallEvent['type']>> = {
  connecting: new Set([
    'REMOTE_RINGING',
    'REMOTE_ACCEPTED',
    'HANGUP',
    'REMOTE_HANGUP',
    'TIMEOUT',
    'FAIL',
    'DESTROY',
  ]),
  incoming: new Set(['ACCEPT', 'REJECT', 'REMOTE_HANGUP', 'TIMEOUT', 'FAIL', 'DESTROY']),
  ringing: new Set(['REMOTE_ACCEPTED', 'HANGUP', 'REMOTE_HANGUP', 'TIMEOUT', 'FAIL', 'DESTROY']),
  active: new Set([
    'HANGUP',
    'REMOTE_HANGUP',
    'HOLD',
    'NETWORK_LOST',
    'TRANSFERRED',
    'FAIL',
    'DESTROY',
  ]),
  holding: new Set([
    'RESUME',
    'HANGUP',
    'REMOTE_HANGUP',
    'NETWORK_LOST',
    'TRANSFERRED',
    'FAIL',
    'DESTROY',
  ]),
  reconnecting: new Set([
    'NETWORK_RESTORED',
    'HANGUP',
    'REMOTE_HANGUP',
    'TIMEOUT',
    'FAIL',
    'DESTROY',
  ]),
  ending: new Set(['REMOTE_HANGUP', 'FAIL', 'DESTROY']),
  ended: new Set(),
  failed: new Set(),
};

export function isTerminal(state: CallState): boolean {
  return terminal.has(state);
}

export function acceptedEvents(state: CallState): readonly CallEvent['type'][] {
  return [...legal[state]];
}

export function transition(
  snapshot: CallSnapshot,
  event: CallEvent,
  now = Date.now(),
): CallSnapshot {
  if (isTerminal(snapshot.state)) return snapshot;
  if (!legal[snapshot.state].has(event.type)) {
    throw new CloudCallError(
      'INVALID_STATE',
      `Cannot apply ${event.type} while call is ${snapshot.state}`,
    );
  }
  if (event.sequence !== undefined && event.sequence <= snapshot.revision) return snapshot;
  let state: CallState = snapshot.state;
  let endReason = snapshot.endReason;
  if (event.type === 'REMOTE_RINGING') state = 'ringing';
  else if (
    event.type === 'REMOTE_ACCEPTED' ||
    event.type === 'ACCEPT' ||
    event.type === 'NETWORK_RESTORED'
  )
    state = 'active';
  else if (event.type === 'HOLD') state = 'holding';
  else if (event.type === 'RESUME') state = 'active';
  else if (event.type === 'NETWORK_LOST') state = 'reconnecting';
  else if (event.type === 'FAIL') {
    state = 'failed';
    endReason = 'signaling-error';
  } else if (event.type === 'HANGUP') {
    state = 'ended';
    endReason =
      snapshot.state === 'connecting' || snapshot.state === 'ringing'
        ? 'cancelled'
        : 'local-hangup';
  } else if (event.type === 'REMOTE_HANGUP') {
    state = 'ended';
    endReason = 'remote-hangup';
  } else if (event.type === 'REJECT') {
    state = 'ended';
    endReason = 'rejected';
  } else if (event.type === 'TIMEOUT') {
    state = 'ended';
    endReason = 'timeout';
  } else if (event.type === 'TRANSFERRED') {
    state = 'ended';
    endReason = 'transferred';
  } else if (event.type === 'DESTROY') {
    state = 'ended';
    endReason = 'sdk-destroyed';
  }
  const next: CallSnapshot = {
    ...snapshot,
    state,
    revision: event.sequence ?? snapshot.revision + 1,
  };
  if (endReason !== undefined) next.endReason = endReason;
  if (state === 'active' && next.connectedAt === undefined) next.connectedAt = now;
  if (terminal.has(state)) next.endedAt = now;
  return next;
}
