import type { CallQuality, QualityLevel } from './types';

export interface RtcAudioStat {
  type: string;
  kind?: string;
  jitter?: number;
  packetsLost?: number;
  packetsReceived?: number;
  state?: string;
  nominated?: boolean;
  currentRoundTripTime?: number;
}

export function classifyCallQuality(input: {
  jitterMs?: number;
  roundTripTimeMs?: number;
  packetsLost?: number;
  packetsReceived?: number;
}): QualityLevel {
  const lost = input.packetsLost ?? 0;
  const received = input.packetsReceived ?? 0;
  const lossRate = received + lost > 0 ? lost / (received + lost) : 0;
  const rtt = input.roundTripTimeMs;
  const jitter = input.jitterMs;
  if (rtt === undefined && jitter === undefined && received + lost === 0) return 'unknown';
  if (lossRate > 0.05 || (rtt ?? 0) > 400 || (jitter ?? 0) > 80) return 'poor';
  if (lossRate > 0.02 || (rtt ?? 0) > 200 || (jitter ?? 0) > 40) return 'fair';
  return 'good';
}

/** Maps an RTCStatsReport-like collection into a softphone quality sample. */
export function qualityFromAudioStats(
  report: { forEach(callback: (stat: RtcAudioStat) => void): void },
  now = Date.now(),
): CallQuality {
  let jitterMs: number | undefined;
  let roundTripTimeMs: number | undefined;
  let packetsLost: number | undefined;
  let packetsReceived: number | undefined;
  report.forEach((stat) => {
    if (stat.type === 'inbound-rtp' && (stat.kind === 'audio' || stat.kind === undefined)) {
      if (typeof stat.jitter === 'number') jitterMs = stat.jitter * 1000;
      if (typeof stat.packetsLost === 'number') packetsLost = stat.packetsLost;
      if (typeof stat.packetsReceived === 'number') packetsReceived = stat.packetsReceived;
    }
    if (
      stat.type === 'candidate-pair' &&
      stat.state === 'succeeded' &&
      (stat.nominated === undefined || stat.nominated) &&
      typeof stat.currentRoundTripTime === 'number'
    ) {
      roundTripTimeMs = stat.currentRoundTripTime * 1000;
    }
  });
  const sample: {
    jitterMs?: number;
    roundTripTimeMs?: number;
    packetsLost?: number;
    packetsReceived?: number;
  } = {};
  if (jitterMs !== undefined) sample.jitterMs = jitterMs;
  if (roundTripTimeMs !== undefined) sample.roundTripTimeMs = roundTripTimeMs;
  if (packetsLost !== undefined) sample.packetsLost = packetsLost;
  if (packetsReceived !== undefined) sample.packetsReceived = packetsReceived;
  const quality: CallQuality = {
    timestamp: now,
    level: classifyCallQuality(sample),
  };
  if (jitterMs !== undefined) quality.jitterMs = jitterMs;
  if (roundTripTimeMs !== undefined) quality.roundTripTimeMs = roundTripTimeMs;
  if (packetsLost !== undefined) quality.packetsLost = packetsLost;
  if (packetsReceived !== undefined) quality.packetsReceived = packetsReceived;
  return quality;
}
