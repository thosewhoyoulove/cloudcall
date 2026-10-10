// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CallControls } from './index';
import type { CallHandle, CallSnapshot } from '@cloudcall/core';
describe('CallControls', () => {
  it('offers accept and reject for incoming calls', () => {
    const snapshot: CallSnapshot = {
      id: '1',
      phoneNumber: '10086',
      direction: 'inbound',
      state: 'incoming',
      muted: false,
      startedAt: 0,
      revision: 0,
    };
    const call = {
      id: '1',
      getSnapshot: () => snapshot,
      accept: vi.fn(),
      reject: vi.fn(),
      hangup: vi.fn(),
      hold: vi.fn(),
      resume: vi.fn(),
      mute: vi.fn(),
      sendDtmf: vi.fn(),
      transfer: vi.fn(),
      subscribe: () => () => {},
    } satisfies CallHandle;
    render(<CallControls call={call} snapshot={snapshot} />);
    expect(screen.getByRole('button', { name: '接听' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '拒接' })).toBeTruthy();
  });
});
