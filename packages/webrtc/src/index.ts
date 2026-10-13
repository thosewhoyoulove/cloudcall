import type { AudioDevice, CallQuality, MediaAdapter, QualityLevel } from '@cloudcall/core';

export interface QualitySample {
  timestamp: number;
  jitterMs?: number;
  roundTripTimeMs?: number;
  packetsLost?: number;
}

const QUALITY_PRESETS: Record<
  Exclude<QualityLevel, 'unknown'>,
  Omit<CallQuality, 'timestamp' | 'level'>
> = {
  good: { jitterMs: 8, roundTripTimeMs: 42, packetsLost: 0, packetsReceived: 200 },
  fair: { jitterMs: 48, roundTripTimeMs: 220, packetsLost: 3, packetsReceived: 120 },
  poor: { jitterMs: 96, roundTripTimeMs: 480, packetsLost: 18, packetsReceived: 80 },
};
export class BrowserMediaManager implements MediaAdapter {
  private readonly streams = new Map<string, MediaStream>();
  private output: HTMLAudioElement | undefined;
  private inputDevice: string | undefined;
  async acquire(callId: string, signal: AbortSignal): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('MediaDevices API is unavailable');
    const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true };
    if (this.inputDevice) audio.deviceId = { exact: this.inputDevice };
    const stream = await navigator.mediaDevices.getUserMedia({
      audio,
      video: false,
    });
    if (signal.aborted) {
      stream.getTracks().forEach((track) => track.stop());
      throw signal.reason;
    }
    this.streams.set(callId, stream);
  }
  async release(callId: string): Promise<void> {
    this.streams
      .get(callId)
      ?.getTracks()
      .forEach((track) => track.stop());
    this.streams.delete(callId);
  }
  async setMuted(callId: string, muted: boolean): Promise<void> {
    this.streams
      .get(callId)
      ?.getAudioTracks()
      .forEach((track) => {
        track.enabled = !muted;
      });
  }
  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    return navigator.mediaDevices.enumerateDevices();
  }
  async setInputDevice(deviceId: string): Promise<void> {
    this.inputDevice = deviceId;
  }
  async setOutputDevice(deviceId: string): Promise<void> {
    this.output ??= new Audio();
    if (!('setSinkId' in this.output))
      throw new Error('Audio output selection is not supported by this browser');
    await this.output.setSinkId(deviceId);
  }
  async destroy(): Promise<void> {
    await Promise.all([...this.streams.keys()].map((id) => this.release(id)));
    this.output?.pause();
    this.output = undefined;
  }
}

export class MockMediaAdapter implements MediaAdapter {
  permissionDenied = false;
  private readonly active = new Set<string>();
  private readonly muted = new Set<string>();
  private qualityLevel: Exclude<QualityLevel, 'unknown'> = 'good';
  private inputDevice = 'mock-mic';
  private outputDevice = 'mock-speaker';
  setPermissionDenied(value: boolean): void {
    this.permissionDenied = value;
  }
  setQuality(level: Exclude<QualityLevel, 'unknown'>): void {
    this.qualityLevel = level;
  }
  async acquire(callId: string, signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw signal.reason;
    if (this.permissionDenied)
      throw new DOMException('[Mock] microphone denied', 'NotAllowedError');
    this.active.add(callId);
  }
  async release(callId: string): Promise<void> {
    this.active.delete(callId);
    this.muted.delete(callId);
  }
  async setMuted(callId: string, muted: boolean): Promise<void> {
    if (!this.active.has(callId)) throw new Error('[Mock] media is not acquired');
    if (muted) this.muted.add(callId);
    else this.muted.delete(callId);
  }
  async enumerateDevices(): Promise<readonly AudioDevice[]> {
    return [
      { deviceId: 'mock-mic', kind: 'audioinput', label: 'Mock 麦克风' },
      { deviceId: 'mock-headset', kind: 'audioinput', label: 'Mock 耳麦' },
      { deviceId: 'mock-speaker', kind: 'audiooutput', label: 'Mock 扬声器' },
    ];
  }
  async setInputDevice(deviceId: string): Promise<void> {
    this.inputDevice = deviceId;
  }
  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDevice = deviceId;
  }
  async getQuality(callId: string): Promise<CallQuality | undefined> {
    if (!this.active.has(callId)) return undefined;
    return {
      timestamp: Date.now(),
      level: this.qualityLevel,
      ...QUALITY_PRESETS[this.qualityLevel],
    };
  }
  selectedDevices(): { inputDevice: string; outputDevice: string } {
    return { inputDevice: this.inputDevice, outputDevice: this.outputDevice };
  }
  async destroy(): Promise<void> {
    this.active.clear();
    this.muted.clear();
  }
  diagnostics(): { activeStreams: number; mutedStreams: number } {
    return { activeStreams: this.active.size, mutedStreams: this.muted.size };
  }
}
