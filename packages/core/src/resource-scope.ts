export class ResourceScope {
  private readonly disposers = new Set<() => void | Promise<void>>();
  private disposed = false;
  readonly controller = new AbortController();
  add(disposer: () => void | Promise<void>): () => void {
    if (this.disposed) {
      void disposer();
      return () => undefined;
    }
    this.disposers.add(disposer);
    return () => {
      this.disposers.delete(disposer);
    };
  }
  timeout(callback: () => void, delay: number): () => void {
    const id = setTimeout(callback, delay);
    return this.add(() => clearTimeout(id));
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    const results = await Promise.allSettled([...this.disposers].reverse().map((fn) => fn()));
    this.disposers.clear();
    const rejected = results.find(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    );
    if (rejected) throw rejected.reason;
  }
}
