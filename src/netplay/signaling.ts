/**
 * WebSocket Signaling Client for WebRTC & Room Management
 */

import { Participant, RoomInfo, ChatMessage } from "../types";

export type SignalingCallback = (msg: Record<string, unknown>) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, SignalingCallback[]> = new Map();
  private isConnected: boolean = false;
  private pingInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private sendQueue: string[] = [];
  private lastPingSent: number = 0;
  public currentLatency: number = 0;

  constructor() {
    this.connect();
  }

  public connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emitLocal("connected", {});
        this.startPingLoop();

        // Flush any queued outgoing messages
        while (this.sendQueue.length > 0 && this.ws && this.ws.readyState === WebSocket.OPEN) {
          const msg = this.sendQueue.shift();
          if (msg) this.ws.send(msg);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "pong") {
            this.currentLatency = Math.round(Date.now() - data.clientTimestamp);
            this.emitLocal("pong", { rtt: this.currentLatency });
            return;
          }
          this.emitLocal(data.type, data);
        } catch (err) {
          console.warn("Signaling parse warning:", err);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.emitLocal("disconnected", {});
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        // Auto reconnect with backoff
        if (!this.reconnectTimeout) {
          this.reconnectTimeout = window.setTimeout(() => {
            this.reconnectTimeout = null;
            this.connect();
          }, 1500);
        }
      };

      this.ws.onerror = () => {
        // Handled silently; onclose will handle reconnection
      };
    } catch (err) {
      console.warn("Signaling connection attempt failed, will retry:", err);
      if (!this.reconnectTimeout) {
        this.reconnectTimeout = window.setTimeout(() => {
          this.reconnectTimeout = null;
          this.connect();
        }, 2000);
      }
    }
  }

  private startPingLoop() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = window.setInterval(() => {
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSent = Date.now();
        this.send({ type: "ping", clientTimestamp: this.lastPingSent });
      }
    }, 3000);
  }

  public send(data: Record<string, unknown>) {
    const payload = JSON.stringify(data);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(payload);
    } else {
      // Buffer outgoing packets until socket is ready
      if (this.sendQueue.length < 50) {
        this.sendQueue.push(payload);
      }
    }
  }

  public on(event: string, cb: SignalingCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(cb);
  }

  public off(event: string, cb: SignalingCallback) {
    const list = this.listeners.get(event);
    if (list) {
      this.listeners.set(
        event,
        list.filter((fn) => fn !== cb)
      );
    }
  }

  private emitLocal(event: string, data: Record<string, unknown>) {
    const cbs = this.listeners.get(event);
    if (cbs) {
      for (const cb of cbs) {
        cb(data);
      }
    }
  }

  public close() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
