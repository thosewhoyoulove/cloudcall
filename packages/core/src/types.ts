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
  | 'transferred'
  | 'sdk-destroyed';

export type RecordingState = 'off' | 'pending' | 'recording' | 'stopped';
export type QualityLevel = 'good' | 'fair' | 'poor' | 'unknown';
export type AgentPresence = 'available' | 'away' | 'busy' | 'wrap-up' | 'offline';
export type PresenceReason = 'manual' | 'call' | 'wrap-up' | 'destroy';

export interface CallQuality {
  timestamp: number;
  level: QualityLevel;
  jitterMs?: number;
  roundTripTimeMs?: number;
  packetsLost?: number;
  packetsReceived?: number;
}

export interface AgentPresenceChange {
  presence: AgentPresence;
  reason: PresenceReason;
}

export interface ScreenPop {
  callId: string;
  phoneNumber: string;
  direction: CallDirection;
  businessContext?: Readonly<Record<string, unknown>>;
}

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
  recording?: RecordingState;
  recordingId?: string;
  businessContext?: Readonly<Record<string, unknown>>;
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
  | { type: 'TRANSFERRED'; sequence?: number }
  | { type: 'DESTROY'; sequence?: number };

export interface DialRequest {
  phoneNumber: string;
  businessContext?: Readonly<Record<string, unknown>>;
}
export interface IncomingCall {
  id: string;
  phoneNumber: string;
  businessContext?: Readonly<Record<string, unknown>>;
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
  /** Real adapters confirm non-terminal commands before the SDK updates state. */
  readonly confirmsCommands?: boolean;
  connect(signal: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;
  send(command: Command, signal: AbortSignal): Promise<void>;
  subscribe(listener: (event: TransportEvent) => void): () => void;
}

export interface AudioDevice {
  deviceId: string;
  kind: string;
  label: string;
}

export interface MediaAdapter {
  acquire(callId: string, signal: AbortSignal): Promise<void>;
  release(callId: string): Promise<void>;
  setMuted(callId: string, muted: boolean): Promise<void>;
  setInputDevice?(deviceId: string): Promise<void>;
  setOutputDevice?(deviceId: string): Promise<void>;
  enumerateDevices?(): Promise<readonly AudioDevice[]>;
  getQuality?(callId: string): Promise<CallQuality | undefined>;
  destroy(): Promise<void>;
}

export interface RecordingHook {
  start(call: CallSnapshot): Promise<{ id: string }>;
  stop(call: CallSnapshot, recordingId: string): Promise<void>;
}

export interface HostAdapter {
  getAccessToken(signal: AbortSignal): Promise<string>;
  getUserContext?(): Promise<Readonly<Record<string, unknown>>>;
  track?(name: string, data: Readonly<Record<string, unknown>>): void;
  navigate?(url: string): void;
  /** CRM screen-pop. Failures are reported on the error bus and do not end the call. */
  screenPop?(pop: ScreenPop): void | Promise<void>;
}

export interface CloudCallConfig {
  callTimeoutMs?: number;
  maxConcurrentCalls?: number;
  /** Client-side after-call work. Zero keeps the agent available as soon as the call ends. */
  wrapUpMs?: number;
  /** Set to 0 to disable polling. Samples are skipped when media has no getQuality. */
  qualityIntervalMs?: number;
}
export interface CloudCallOptions {
  transport: SignalingTransport;
  media: MediaAdapter;
  host: HostAdapter;
  recording?: RecordingHook;
  config?: CloudCallConfig;
}

export interface SdkEvents {
  'sdk:state': SdkState;
  'call:created': CallSnapshot;
  'call:updated': CallSnapshot;
  'call:ended': CallSnapshot;
  'call:quality': { callId: string; quality: CallQuality };
  'agent:presence': AgentPresenceChange;
  'crm:screen-pop': ScreenPop;
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
  startRecording(): Promise<void>;
  stopRecording(): Promise<void>;
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
