export class TypedEventBus<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<(value: never) => void>>();
  on<K extends keyof Events>(event: K, listener: (value: Events[K]) => void): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as (value: never) => void);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener as (value: never) => void);
    };
  }
  emit<K extends keyof Events>(event: K, value: Events[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(value as never);
  }
  clear(): void {
    this.listeners.clear();
  }
  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}
