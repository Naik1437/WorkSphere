import type { Response } from 'express';
import { randomUUID } from 'crypto';

export interface RealtimeEvent<T = unknown> {
  id: string;
  type: string;
  organizationId: string;
  actorId?: string;
  payload: T;
  timestamp: string;
}

export interface Subscriber {
  id: string;
  organizationId: string;
  res: Response;
  connectedAt: Date;
}

export interface BroadcasterOptions {
  heartbeatIntervalMs?: number;
  maxBufferSize?: number;
}

/**
 * High-performance, tenant-isolated Server-Sent Events (SSE) Broadcaster.
 * Manages active HTTP event streams per organization with automatic keep-alive,
 * client disconnect cleanup, and reconnection replay buffers.
 */
export class RealtimeBroadcaster {
  private subscribers: Map<string, Set<Subscriber>> = new Map();
  private eventBuffer: Map<string, RealtimeEvent[]> = new Map();
  private maxBufferSize: number;
  private heartbeatTimer?: NodeJS.Timeout;

  constructor(options?: BroadcasterOptions) {
    this.maxBufferSize = options?.maxBufferSize ?? 50;

    // Default 25s heartbeat to prevent proxy and browser timeouts
    const interval = options?.heartbeatIntervalMs ?? 25000;
    if (interval > 0) {
      this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), interval);
      if (this.heartbeatTimer.unref) {
        this.heartbeatTimer.unref();
      }
    }
  }

  /**
   * Registers an active client SSE response stream for a specific organization.
   */
  public subscribe(
    organizationId: string,
    res: Response,
    lastEventId?: string,
  ): { subscriberId: string; unsubscribe: () => void } {
    const subscriberId = randomUUID();
    const subscriber: Subscriber = {
      id: subscriberId,
      organizationId,
      res,
      connectedAt: new Date(),
    };

    if (!this.subscribers.has(organizationId)) {
      this.subscribers.set(organizationId, new Set());
    }
    this.subscribers.get(organizationId)!.add(subscriber);

    // Initial handshake comment + connection event
    res.write(`: connected\n\n`);
    const initialId = randomUUID();
    this.writeSseMessage(res, {
      id: initialId,
      type: 'system.connected',
      organizationId,
      payload: {
        status: 'connected',
        subscriberId,
        organizationId,
        timestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    // Replay missed events from buffer if Last-Event-ID was provided
    if (lastEventId) {
      this.replayMissedEvents(organizationId, res, lastEventId);
    }

    const unsubscribe = () => {
      const orgSubs = this.subscribers.get(organizationId);
      if (orgSubs) {
        orgSubs.delete(subscriber);
        if (orgSubs.size === 0) {
          this.subscribers.delete(organizationId);
        }
      }
    };

    return { subscriberId, unsubscribe };
  }

  /**
   * Broadcasts an event strictly to active subscribers belonging to the given organizationId.
   */
  public publish<T = unknown>(
    organizationId: string,
    input: { type: string; payload: T; actorId?: string },
  ): RealtimeEvent<T> {
    const event: RealtimeEvent<T> = {
      id: randomUUID(),
      type: input.type,
      organizationId,
      actorId: input.actorId,
      payload: input.payload,
      timestamp: new Date().toISOString(),
    };

    // Append to tenant buffer for reconnection replaying
    if (!this.eventBuffer.has(organizationId)) {
      this.eventBuffer.set(organizationId, []);
    }
    const buffer = this.eventBuffer.get(organizationId)!;
    buffer.push(event);
    if (buffer.length > this.maxBufferSize) {
      buffer.shift();
    }

    // Deliver to all active subscribers of this organization
    const orgSubs = this.subscribers.get(organizationId);
    if (orgSubs && orgSubs.size > 0) {
      for (const subscriber of orgSubs) {
        try {
          this.writeSseMessage(subscriber.res, event);
        } catch {
          // Socket write failed, will be cleaned up on close
        }
      }
    }

    return event;
  }

  /**
   * Replays buffered events occurring after the client's lastEventId.
   */
  private replayMissedEvents(organizationId: string, res: Response, lastEventId: string): void {
    const buffer = this.eventBuffer.get(organizationId);
    if (!buffer || buffer.length === 0) return;

    const lastIdx = buffer.findIndex((e) => e.id === lastEventId);
    const missed = lastIdx >= 0 ? buffer.slice(lastIdx + 1) : buffer;

    for (const event of missed) {
      try {
        this.writeSseMessage(res, event);
      } catch {
        break;
      }
    }
  }

  /**
   * Formats and writes standard W3C Server-Sent Event message frame.
   */
  private writeSseMessage(res: Response, event: RealtimeEvent): void {
    res.write(`id: ${event.id}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    const flushable = res as unknown as { flush?: () => void };
    if (typeof flushable.flush === 'function') {
      flushable.flush();
    }
  }

  /**
   * Sends SSE comment ping (: keep-alive) to prevent connection timeouts.
   */
  private sendHeartbeat(): void {
    for (const subs of this.subscribers.values()) {
      for (const sub of subs) {
        try {
          sub.res.write(`: keep-alive ${Date.now()}\n\n`);
        } catch {
          // Subscriber will clean up on socket termination
        }
      }
    }
  }

  /**
   * Returns active subscriber count for monitoring and testing.
   */
  public getSubscriberCount(organizationId?: string): number {
    if (organizationId) {
      return this.subscribers.get(organizationId)?.size ?? 0;
    }
    let total = 0;
    for (const subs of this.subscribers.values()) {
      total += subs.size;
    }
    return total;
  }

  /**
   * Gracefully terminates all active event streams and clears timers.
   */
  public close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    for (const subs of this.subscribers.values()) {
      for (const sub of subs) {
        try {
          sub.res.end();
        } catch {
          // Ignore close errors
        }
      }
    }
    this.subscribers.clear();
    this.eventBuffer.clear();
  }
}
