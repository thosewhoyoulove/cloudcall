import { describe, expect, it } from 'vitest';
import { classifyCallQuality, qualityFromAudioStats } from './quality';

describe('call quality', () => {
  it('classifies loss, delay and jitter into softphone bands', () => {
    expect(
      classifyCallQuality({
        jitterMs: 10,
        roundTripTimeMs: 40,
        packetsLost: 0,
        packetsReceived: 100,
      }),
    ).toBe('good');
    expect(
      classifyCallQuality({
        jitterMs: 10,
        roundTripTimeMs: 250,
        packetsLost: 0,
        packetsReceived: 100,
      }),
    ).toBe('fair');
    expect(
      classifyCallQuality({
        jitterMs: 10,
        roundTripTimeMs: 40,
        packetsLost: 10,
        packetsReceived: 90,
      }),
    ).toBe('poor');
    expect(classifyCallQuality({})).toBe('unknown');
  });

  it('reads audio RTP and the nominated candidate pair', () => {
    const quality = qualityFromAudioStats({
      forEach(callback) {
        callback({
          type: 'inbound-rtp',
          kind: 'audio',
          jitter: 0.012,
          packetsLost: 0,
          packetsReceived: 50,
        });
        callback({
          type: 'inbound-rtp',
          kind: 'video',
          jitter: 1,
          packetsLost: 40,
          packetsReceived: 1,
        });
        callback({
          type: 'candidate-pair',
          state: 'succeeded',
          nominated: true,
          currentRoundTripTime: 0.08,
        });
      },
    });
    expect(quality).toMatchObject({
      level: 'good',
      jitterMs: 12,
      roundTripTimeMs: 80,
      packetsLost: 0,
      packetsReceived: 50,
    });
  });
});
