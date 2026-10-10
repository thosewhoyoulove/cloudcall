import type { MediaAdapter } from '@cloudcall/core';

export interface QualitySample {
  timestamp: number;
  jitterMs?: number;
  roundTripTimeMs?: number;
  packetsLost?: number;
}
export class BrowserMediaManager implements MediaAdapter {
  private readonly streams = new Map<string, MediaStream>();
  private output: HTMLAudioElement | undefined;
  async acquire(callId: string, signal: AbortSignal): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('MediaDevices API is unavailable');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
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
  setPermissionDenied(value: boolean): void {
    this.permissionDenied = value;
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
  async destroy(): Promise<void> {
    this.active.clear();
    this.muted.clear();
  }
  diagnostics(): { activeStreams: number; mutedStreams: number } {
    return { activeStreams: this.active.size, mutedStreams: this.muted.size };
  }
}
