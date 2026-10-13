// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CallControls, QualityMeter } from './index';
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
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      subscribe: () => () => {},
    } satisfies CallHandle;
    render(<CallControls call={call} snapshot={snapshot} />);
    expect(screen.getByRole('button', { name: '接听' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '拒接' })).toBeTruthy();
  });
  it('offers recording and renders a quality meter for an active call', () => {
    const snapshot: CallSnapshot = {
      id: '1',
      phoneNumber: '10086',
      direction: 'outbound',
      state: 'active',
      muted: false,
      startedAt: 0,
      revision: 1,
      recording: 'off',
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
      startRecording: vi.fn(async () => {}),
      stopRecording: vi.fn(async () => {}),
      subscribe: () => () => {},
    } satisfies CallHandle;
    render(
      <>
        <CallControls call={call} snapshot={snapshot} />
        <QualityMeter quality={{ timestamp: 1, level: 'good', roundTripTimeMs: 40 }} />
      </>,
    );
    expect(screen.getByRole('button', { name: '录音' })).toBeTruthy();
    expect(screen.getByText('质量 良好')).toBeTruthy();
  });
});
