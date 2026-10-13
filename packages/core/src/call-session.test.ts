import { describe, expect, it, vi } from 'vitest';
import { CallSession } from './call-session';
import type { Command } from './types';

describe('confirmed transport commands', () => {
  function fixture(send: (command: Command) => Promise<void>) {
    return new CallSession(
      {
        id: 'sip-call',
        phoneNumber: '1001',
        direction: 'inbound',
        state: 'incoming',
        muted: false,
        startedAt: 1,
        revision: 0,
      },
      {
        confirmsCommands: true,
        connect: async () => {},
        disconnect: async () => {},
        subscribe: () => () => {},
        send,
      },
      {
        acquire: async () => {},
        release: async () => {},
        setMuted: async () => {},
        destroy: async () => {},
      },
      new AbortController().signal,
      () => {},
    );
  }
  it('does not claim incoming audio is connected until SIP establishes the session', async () => {
    const call = fixture(async () => {});
    await call.accept();
    expect(call.getSnapshot().state).toBe('incoming');
    await call.applyRemote({ type: 'ACCEPT' });
    expect(call.getSnapshot().state).toBe('active');
  });
  it('keeps an established call active if the PBX rejects hold', async () => {
    const call = fixture(async (command) => {
      if (command.type === 'hold') throw new Error('Rejected');
    });
    await call.applyRemote({ type: 'ACCEPT' });
    await expect(call.hold()).rejects.toThrow('Rejected');
    expect(call.getSnapshot().state).toBe('active');
  });
  it('validates operations before sending them to the PBX', async () => {
    const send = vi.fn(async () => {});
    const call = fixture(send);
    await expect(call.hold()).rejects.toThrow('Cannot apply');
    expect(send).not.toHaveBeenCalled();
  });
  it('ends the call after the transport accepts a blind transfer', async () => {
    const call = fixture(async () => {});
    await call.applyRemote({ type: 'ACCEPT' });
    await call.transfer('1002');
    expect(call.getSnapshot()).toMatchObject({ state: 'ended', endReason: 'transferred' });
  });
  it('does not end the call when the transport rejects the transfer', async () => {
    const call = fixture(async (command) => {
      if (command.type === 'transfer') throw new Error('Rejected');
    });
    await call.applyRemote({ type: 'ACCEPT' });
    await expect(call.transfer('1002')).rejects.toThrow('Rejected');
    expect(call.getSnapshot().state).toBe('active');
  });
});
