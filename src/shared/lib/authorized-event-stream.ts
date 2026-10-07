type StreamListener = (event: Event) => void;
type RefreshTokens = () => Promise<unknown>;

/** Fetch-based SSE keeps cookie auth and explicit 401 refresh support. */
export class AuthorizedEventStream {
  private readonly controller = new AbortController();
  private readonly listeners = new Map<string, Set<StreamListener>>();
  private closed = false;
  private retryTimer: number | undefined;
  private retryDelay = 2_000;

  constructor(private readonly url: string, private readonly refreshTokens: RefreshTokens) {
    void this.connect(true);
  }

  addEventListener(type: string, listener: StreamListener) {
    const listeners = this.listeners.get(type) ?? new Set<StreamListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  close() {
    this.closed = true;
    if (this.retryTimer !== undefined) window.clearTimeout(this.retryTimer);
    this.controller.abort();
  }

  private scheduleReconnect() {
    if (this.closed || this.retryTimer !== undefined) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = undefined;
      if (!this.closed) void this.connect(true);
    }, delay);
  }

  private emit(type: string, event: Event) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }

  private async connect(retryOnUnauthorized: boolean): Promise<void> {
    try {
      const response = await fetch(this.url, { credentials: "include", signal: this.controller.signal });
      if (this.closed) return;
      if (response.status === 401 && retryOnUnauthorized) {
        try {
          await this.refreshTokens();
        } catch {
          this.close();
          this.emit("error", new Event("error"));
          return;
        }
        if (!this.closed) await this.connect(false);
        return;
      }
      if (!response.ok || !response.body) {
        // Permission and missing-resource responses cannot be repaired by a
        // timer. Stop every consumer of this shared stream implementation.
        const permanent = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
        if (permanent) this.close();
        this.emit("error", new Event("error"));
        this.scheduleReconnect();
        return;
      }

      const reader = response.body.getReader();
      this.retryDelay = 2_000;
      const decoder = new TextDecoder();
      let buffer = "";
      let eventType = "message";
      let data: string[] = [];
      const dispatch = () => {
        if (data.length > 0) this.emit(eventType, new MessageEvent(eventType, { data: data.join("\n") }));
        eventType = "message";
        data = [];
      };

      while (!this.closed) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line === "") dispatch();
          else if (line.startsWith("event:")) eventType = line.slice("event:".length).trim() || "message";
          else if (line.startsWith("data:")) data.push(line.slice("data:".length).trimStart());
        }
        if (done) break;
      }
      if (!this.closed) {
        this.emit("error", new Event("error"));
        this.scheduleReconnect();
      }
    } catch (error) {
      if (!this.closed && !(error instanceof DOMException && error.name === "AbortError")) {
        this.emit("error", new Event("error"));
        this.scheduleReconnect();
      }
    }
  }
}
