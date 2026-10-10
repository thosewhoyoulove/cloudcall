const PROTOCOL = 'cloudcall.rpc.v1';
interface Envelope {
  protocol: typeof PROTOCOL;
  kind: 'ready' | 'request' | 'response';
  requestId?: string;
  method?: string;
  payload?: unknown;
  error?: string;
}

export class IframeRpcClient {
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private ready = false;
  constructor(
    private readonly target: Window,
    private readonly targetOrigin: string,
    private readonly timeoutMs = 5_000,
  ) {
    window.addEventListener('message', this.onMessage);
  }
  isReady(): boolean {
    return this.ready;
  }
  request<T>(method: string, payload?: unknown): Promise<T> {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`iframe RPC ${method} timed out`));
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.target.postMessage(
        { protocol: PROTOCOL, kind: 'request', requestId, method, payload } satisfies Envelope,
        this.targetOrigin,
      );
    });
  }
  destroy(): void {
    window.removeEventListener('message', this.onMessage);
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('RPC client destroyed'));
    }
    this.pending.clear();
  }
  private onMessage = (event: MessageEvent<Envelope>): void => {
    if (
      event.origin !== this.targetOrigin ||
      event.source !== this.target ||
      event.data?.protocol !== PROTOCOL
    )
      return;
    if (event.data.kind === 'ready') {
      this.ready = true;
      return;
    }
    if (event.data.kind !== 'response' || !event.data.requestId) return;
    const pending = this.pending.get(event.data.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(event.data.requestId);
    if (event.data.error) pending.reject(new Error(event.data.error));
    else pending.resolve(event.data.payload);
  };
}
