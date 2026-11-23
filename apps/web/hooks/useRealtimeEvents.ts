'use client';

import { useEffect, useRef, useState } from 'react';

export interface RealtimeEventPayload<T = unknown> {
  id: string;
  type: string;
  organizationId: string;
  actorId?: string;
  payload: T;
  timestamp: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface UseRealtimeEventsOptions {
  token?: string | null;
  apiBaseUrl?: string;
  enabled?: boolean;
  onEvent?: (event: RealtimeEventPayload) => void;
  onTaskCreated?: (task: any) => void;
  onTaskUpdated?: (task: any) => void;
  onTaskDeleted?: (task: { taskId: string; projectId?: string }) => void;
  onCommentCreated?: (comment: any) => void;
}

/**
 * React hook to connect to WorkSphere Server-Sent Events (SSE) real-time stream.
 * Automatically handles authentication via token query parameter, tenant isolation,
 * reconnection, and typed event callbacks.
 */
export function useRealtimeEvents({
  token,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || '',
  enabled = true,
  onEvent,
  onTaskCreated,
  onTaskUpdated,
  onTaskDeleted,
  onCommentCreated,
}: UseRealtimeEventsOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<RealtimeEventPayload | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setStatus('disconnected');
      }
      return;
    }

    const url = `${apiBaseUrl}/api/v1/events?token=${encodeURIComponent(token)}`;
    setStatus('connecting');

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus('connected');
    };

    es.onerror = () => {
      setStatus('error');
    };

    const handleMessage = (e: MessageEvent) => {
      try {
        const parsed: RealtimeEventPayload = JSON.parse(e.data);
        setLastEvent(parsed);
        onEvent?.(parsed);

        switch (parsed.type) {
          case 'task.created':
            onTaskCreated?.(parsed.payload);
            break;
          case 'task.updated':
            onTaskUpdated?.(parsed.payload);
            break;
          case 'task.deleted':
            onTaskDeleted?.(parsed.payload as any);
            break;
          case 'comment.created':
            onCommentCreated?.(parsed.payload);
            break;
        }
      } catch {
        // Ignore unparseable frames (like keep-alive pings)
      }
    };

    // Listen to named events and default message
    const eventTypes = [
      'system.connected',
      'task.created',
      'task.updated',
      'task.deleted',
      'subtask.created',
      'comment.created',
      'notification.reminder',
      'webhook.dispatched',
    ];

    for (const evt of eventTypes) {
      es.addEventListener(evt, handleMessage);
    }
    es.onmessage = handleMessage;

    return () => {
      for (const evt of eventTypes) {
        es.removeEventListener(evt, handleMessage);
      }
      es.close();
      eventSourceRef.current = null;
      setStatus('disconnected');
    };
  }, [
    token,
    apiBaseUrl,
    enabled,
    onEvent,
    onTaskCreated,
    onTaskUpdated,
    onTaskDeleted,
    onCommentCreated,
  ]);

  return {
    status,
    lastEvent,
    isConnected: status === 'connected',
    close: () => {
      eventSourceRef.current?.close();
      setStatus('disconnected');
    },
  };
}
