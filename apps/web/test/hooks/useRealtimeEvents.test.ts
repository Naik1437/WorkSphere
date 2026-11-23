import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useRealtimeEvents } from '../../hooks/useRealtimeEvents';

// Mock EventSource in jsdom
class MockEventSource {
  public static instances: MockEventSource[] = [];
  public url: string;
  public onopen: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public onmessage: ((e: MessageEvent) => void) | null = null;
  public listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  public closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    setTimeout(() => {
      if (!this.closed && this.onopen) {
        this.onopen();
      }
    }, 10);
  }

  public addEventListener(type: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(handler);
  }

  public removeEventListener(type: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((h) => h !== handler);
  }

  public dispatchMockEvent(type: string, data: any) {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    if (this.listeners[type]) {
      this.listeners[type].forEach((cb) => cb(event));
    }
    if (this.onmessage) {
      this.onmessage(event);
    }
  }

  public close() {
    this.closed = true;
  }
}

describe('useRealtimeEvents hook (A07-R01)', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    (global as any).EventSource = MockEventSource;
  });

  afterEach(() => {
    delete (global as any).EventSource;
  });

  it('stays disconnected when disabled or token is missing', () => {
    const { result } = renderHook(() => useRealtimeEvents({ token: null, enabled: false }));
    expect(result.current.status).toBe('disconnected');
    expect(MockEventSource.instances.length).toBe(0);
  });

  it('connects to /api/v1/events with token query parameter', async () => {
    const { result } = renderHook(() =>
      useRealtimeEvents({ token: 'test-token-123', apiBaseUrl: 'http://localhost:4000' }),
    );

    expect(MockEventSource.instances.length).toBe(1);
    expect(MockEventSource.instances[0].url).toBe(
      'http://localhost:4000/api/v1/events?token=test-token-123',
    );

    // Wait for onopen
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.status).toBe('connected');
    expect(result.current.isConnected).toBe(true);
  });

  it('dispatches task callbacks when real-time SSE events arrive', async () => {
    const onTaskCreated = vi.fn();
    const onTaskUpdated = vi.fn();

    const { result } = renderHook(() =>
      useRealtimeEvents({
        token: 'test-token-123',
        onTaskCreated,
        onTaskUpdated,
      }),
    );

    const instance = MockEventSource.instances[0];

    await act(async () => {
      instance.dispatchMockEvent('task.created', {
        id: 'evt-1',
        type: 'task.created',
        payload: { id: 'task-100', title: 'Real-time Live Task' },
      });
    });

    expect(onTaskCreated).toHaveBeenCalledWith({ id: 'task-100', title: 'Real-time Live Task' });
    expect(result.current.lastEvent?.type).toBe('task.created');

    await act(async () => {
      instance.dispatchMockEvent('task.updated', {
        id: 'evt-2',
        type: 'task.updated',
        payload: { id: 'task-100', title: 'Real-time Live Task (Updated)' },
      });
    });

    expect(onTaskUpdated).toHaveBeenCalledWith({
      id: 'task-100',
      title: 'Real-time Live Task (Updated)',
    });
  });

  it('closes connection cleanly on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeEvents({ token: 'test-token-123' }));
    const instance = MockEventSource.instances[0];
    expect(instance.closed).toBe(false);

    unmount();
    expect(instance.closed).toBe(true);
  });
});
