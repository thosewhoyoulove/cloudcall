export type SdkState = 'created' | 'initializing' | 'ready' | 'destroying' | 'destroyed' | 'failed';
export type CallDirection = 'inbound' | 'outbound';
export type CallState =
  | 'connecting'
  | 'incoming'
  | 'ringing'
  | 'active'
  | 'holding'
  | 'reconnecting'
  | 'ending'
  | 'ended'
  | 'failed';

export type CallEndReason =
  | 'local-hangup'
  | 'remote-hangup'
  | 'rejected'
  | 'cancelled'
  | 'timeout'
  | 'network-error'
  | 'signaling-error'
  | 'sdk-destroyed';

export interface CallSnapshot {
  id: string;
  phoneNumber: string;
  direction: CallDirection;
  state: CallState;
  muted: boolean;
  startedAt: number;
  connectedAt?: number;
  endedAt?: number;
  endReason?: CallEndReason;
  revision: number;
}

export type CallEvent =
  | { type: 'REMOTE_RINGING'; sequence?: number }
  | { type: 'REMOTE_ACCEPTED'; sequence?: number }
  | { type: 'ACCEPT'; sequence?: number }
  | { type: 'REJECT'; sequence?: number }
  | { type: 'HANGUP'; sequence?: number }
  | { type: 'REMOTE_HANGUP'; sequence?: number }
  | { type: 'HOLD'; sequence?: number }
  | { type: 'RESUME'; sequence?: number }
  | { type: 'NETWORK_LOST'; sequence?: number }
  | { type: 'NETWORK_RESTORED'; sequence?: number }
  | { type: 'TIMEOUT'; sequence?: number }
  | { type: 'FAIL'; error: Error; sequence?: number }
  | { type: 'DESTROY'; sequence?: number };

export interface DialRequest {
  phoneNumber: string;
  businessContext?: Readonly<Record<string, unknown>>;
}
export interface IncomingCall {
  id: string;
  phoneNumber: string;
}
export interface Command {
  id: string;
  callId: string;
  type: 'dial' | 'accept' | 'reject' | 'hangup' | 'hold' | 'resume' | 'dtmf' | 'transfer';
  payload?: unknown;
}
export type TransportEvent =
  | { type: 'incoming'; call: IncomingCall }
  | { type: 'call-event'; callId: string; event: CallEvent; messageId: string };

export interface SignalingTransport {
  connect(signal: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  send(command: Command, signal: AbortSignal): Promise<void>;
  subscribe(listener: (event: TransportEvent) => void): () => void;
}

export interface MediaAdapter {
  acquire(callId: string, signal: AbortSignal): Promise<void>;
  release(callId: string): Promise<void>;
  setMuted(callId: string, muted: boolean): Promise<void>;
  setOutputDevice?(deviceId: string): Promise<void>;
  destroy(): Promise<void>;
}

export interface HostAdapter {
  getAccessToken(signal: AbortSignal): Promise<string>;
  getUserContext?(): Promise<Readonly<Record<string, unknown>>>;
  track?(name: string, data: Readonly<Record<string, unknown>>): void;
  navigate?(url: string): void;
}

export interface CloudCallConfig {
  callTimeoutMs?: number;
  maxConcurrentCalls?: number;
}
export interface CloudCallOptions {
  transport: SignalingTransport;
  media: MediaAdapter;
  host: HostAdapter;
  config?: CloudCallConfig;
}

export interface SdkEvents {
  'sdk:state': SdkState;
  'call:created': CallSnapshot;
  'call:updated': CallSnapshot;
  'call:ended': CallSnapshot;
  error: CloudCallError;
}

export interface CallHandle {
  readonly id: string;
  getSnapshot(): CallSnapshot;
  accept(): Promise<void>;
  reject(): Promise<void>;
  hangup(): Promise<void>;
  hold(): Promise<void>;
  resume(): Promise<void>;
  mute(muted?: boolean): Promise<void>;
  sendDtmf(tones: string): Promise<void>;
  transfer(target: string): Promise<void>;
  subscribe(listener: (snapshot: CallSnapshot) => void): () => void;
}

export type CloudCallErrorCode =
  | 'INVALID_STATE'
  | 'NOT_INITIALIZED'
  | 'DESTROYED'
  | 'TIMEOUT'
  | 'TRANSPORT'
  | 'MEDIA'
  | 'CAPACITY'
  | 'VALIDATION';
export class CloudCallError extends Error {
  constructor(
    public readonly code: CloudCallErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CloudCallError';
  }
}
