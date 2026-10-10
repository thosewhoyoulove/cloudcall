export type ConnectionState =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';
export interface WireMessage {
  id: string;
  correlationId?: string;
  type: string;
  payload?: unknown;
}
export interface ConnectionOptions {
  url: string;
  heartbeatMs?: number;
  requestTimeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  socketFactory?: (url: string) => WebSocket;
}

export class ConnectionManager {
  private socket: WebSocket | undefined;
  private state: ConnectionState = 'idle';
  private attempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private readonly queue: WireMessage[] = [];
  private readonly pending = new Map<
    string,
    {
      resolve: (message: WireMessage) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly seen = new Set<string>();
  private readonly listeners = new Set<(state: ConnectionState) => void>();
  private closedByUser = false;
  constructor(private readonly options: ConnectionOptions) {}
  getState(): ConnectionState {
    return this.state;
  }
  subscribe(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }
  connect(): void {
    if (this.state === 'connecting' || this.state === 'connected') return;
    this.closedByUser = false;
    this.setState(this.attempts ? 'reconnecting' : 'connecting');
    const socket = (this.options.socketFactory ?? ((url) => new WebSocket(url)))(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.attempts = 0;
      this.setState('connected');
      this.startHeartbeat();
      this.flush();
    };
    socket.onmessage = (message) => this.onMessage(String(message.data));
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.stopHeartbeat();
      if (!this.closedByUser) this.scheduleReconnect();
    };
    socket.onerror = () => socket.close();
  }
  send(message: WireMessage, replaySafe = false): void {
    if (this.state === 'connected' && this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
    else if (replaySafe) this.queue.push(message);
    else
      throw new Error(
        'Connection unavailable; command was not replayed because it is not marked replay-safe',
      );
  }
  request(message: WireMessage, signal?: AbortSignal): Promise<WireMessage> {
    const correlationId = message.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(correlationId);
        reject(new Error(`Request ${correlationId} timed out`));
      }, this.options.requestTimeoutMs ?? 8_000);
      this.pending.set(correlationId, { resolve, reject, timer });
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          this.pending.delete(correlationId);
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
      try {
        this.send(message);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(correlationId);
        reject(error);
      }
    });
  }
  close(): void {
    this.closedByUser = true;
    clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = undefined;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('Connection closed'));
    }
    this.pending.clear();
    this.queue.length = 0;
    this.setState('closed');
  }
  private onMessage(raw: string): void {
    let message: WireMessage;
    try {
      message = JSON.parse(raw) as WireMessage;
    } catch {
      return;
    }
    if (!message.id || this.seen.has(message.id)) return;
    this.seen.add(message.id);
    if (this.seen.size > 1_000) this.seen.delete(this.seen.values().next().value as string);
    if (message.correlationId) {
      const pending = this.pending.get(message.correlationId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.correlationId);
        pending.resolve(message);
      }
    }
  }
  private scheduleReconnect(): void {
    const max = this.options.maxRetries ?? 6;
    if (this.attempts >= max) {
      this.setState('failed');
      return;
    }
    const exponential = (this.options.baseDelayMs ?? 500) * 2 ** this.attempts++;
    const delay = Math.random() * Math.min(exponential, 15_000);
    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }
  private flush(): void {
    while (this.queue.length) this.send(this.queue.shift()!, true);
  }
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        this.send({ id: crypto.randomUUID(), type: 'ping' }, true);
      } catch {
        /* reconnect path owns recovery */
      }
    }, this.options.heartbeatMs ?? 15_000);
  }
  private stopHeartbeat(): void {
    clearInterval(this.heartbeatTimer);
  }
  private setState(state: ConnectionState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
