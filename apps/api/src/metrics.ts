/**
 * WorkSphere Metrics & Monitoring Collector (A14-R08)
 *
 * Lightweight, zero-dependency metrics collector tracking:
 * - API request volume, methods, and status classes (2xx, 3xx, 4xx, 5xx)
 * - Response latency (min, max, average, p50, p90, p99 percentiles)
 * - Error counts and percentage error rates
 * - Database and Redis connectivity and latency
 * - Background queue health (pending, retrying, dead-letter)
 * - Real-time SSE active connections
 * - System runtime (uptime, memory RSS, heap utilization)
 *
 * Exposes both Prometheus text exposition format and structured JSON.
 * Guaranteed zero tenant data, PII, tokens, secrets, or unbounded cardinality keys.
 */

export interface MetricSnapshotOptions {
  dbStatus?: 'up' | 'down' | 'unknown';
  dbLatencyMs?: number;
  redisStatus?: 'up' | 'down' | 'unknown';
  redisLatencyMs?: number;
  queueMetrics?: {
    pendingJobs: number;
    retryingJobs: number;
    deadLetterJobs: number;
  };
  activeConnections?: number;
}

export interface MetricsSnapshot {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptimeSeconds: number;
  process: {
    pid: number;
    nodeVersion: string;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
    };
  };
  http: {
    totalRequests: number;
    inFlightRequests: number;
    totalErrors: number;
    errorRatePercentage: number;
    statusCodes: Record<string, number>;
    statusClasses: {
      '2xx': number;
      '3xx': number;
      '4xx': number;
      '5xx': number;
    };
    methods: Record<string, number>;
    latencyMs: {
      average: number;
      min: number;
      max: number;
      p50: number;
      p90: number;
      p99: number;
    };
  };
  dependencies: {
    database: { status: 'up' | 'down' | 'unknown'; latencyMs?: number };
    redis: { status: 'up' | 'down' | 'unknown'; latencyMs?: number };
  };
  queue?: {
    status: 'healthy' | 'degraded' | 'unknown';
    pendingJobs: number;
    retryingJobs: number;
    deadLetterJobs: number;
  };
  realtime?: {
    activeConnections: number;
  };
}

export class MetricsCollector {
  private startTime = Date.now();
  private inFlight = 0;
  private totalRequests = 0;
  private totalErrors = 0; // 4xx + 5xx
  private totalServerErrors = 0; // 5xx

  private statusCodes: Record<string, number> = {};
  private statusClasses = {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
  };
  private methods: Record<string, number> = {};

  // Sliding window of recent request latencies (capped at 1000 to prevent memory growth)
  private readonly maxLatencySamples = 1000;
  private latencySamples: number[] = [];
  private latencySum = 0;
  private latencyMin: number | null = null;
  private latencyMax = 0;

  public recordRequestStart(): void {
    this.inFlight++;
  }

  public recordRequestEnd(method: string, _path: string, statusCode: number, durationMs: number): void {
    if (this.inFlight > 0) {
      this.inFlight--;
    }
    this.totalRequests++;

    const roundedDuration = Math.round(durationMs * 100) / 100;

    // Track methods (normalized to uppercase)
    const normalizedMethod = (method || 'GET').toUpperCase();
    this.methods[normalizedMethod] = (this.methods[normalizedMethod] || 0) + 1;

    // Track status codes
    const codeStr = statusCode.toString();
    this.statusCodes[codeStr] = (this.statusCodes[codeStr] || 0) + 1;

    // Track status classes
    if (statusCode >= 200 && statusCode < 300) {
      this.statusClasses['2xx']++;
    } else if (statusCode >= 300 && statusCode < 400) {
      this.statusClasses['3xx']++;
    } else if (statusCode >= 400 && statusCode < 500) {
      this.statusClasses['4xx']++;
      this.totalErrors++;
    } else if (statusCode >= 500) {
      this.statusClasses['5xx']++;
      this.totalErrors++;
      this.totalServerErrors++;
    }

    // Track latency
    this.latencySum += roundedDuration;
    if (this.latencyMin === null || roundedDuration < this.latencyMin) {
      this.latencyMin = roundedDuration;
    }
    if (roundedDuration > this.latencyMax) {
      this.latencyMax = roundedDuration;
    }

    if (this.latencySamples.length >= this.maxLatencySamples) {
      this.latencySamples.shift();
    }
    this.latencySamples.push(roundedDuration);
  }

  private calculatePercentiles(): { p50: number; p90: number; p99: number } {
    if (this.latencySamples.length === 0) {
      return { p50: 0, p90: 0, p99: 0 };
    }

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const getPercentile = (p: number) => {
      const idx = Math.min(
        Math.floor((p / 100) * sorted.length),
        sorted.length - 1,
      );
      return sorted[idx] ?? 0;
    };

    return {
      p50: Math.round(getPercentile(50) * 100) / 100,
      p90: Math.round(getPercentile(90) * 100) / 100,
      p99: Math.round(getPercentile(99) * 100) / 100,
    };
  }

  public getMetricsSnapshot(options?: MetricSnapshotOptions): MetricsSnapshot {
    const memory = process.memoryUsage();
    const percentiles = this.calculatePercentiles();
    const avgLatency =
      this.totalRequests > 0
        ? Math.round((this.latencySum / this.totalRequests) * 100) / 100
        : 0;
    const errorRate =
      this.totalRequests > 0
        ? Math.round((this.totalErrors / this.totalRequests) * 10000) / 100
        : 0;

    let systemStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (options?.dbStatus === 'down' || (this.totalRequests > 10 && errorRate > 50)) {
      systemStatus = 'unhealthy';
    } else if (
      options?.redisStatus === 'down' ||
      (this.totalRequests > 10 && errorRate > 15) ||
      (options?.queueMetrics && options.queueMetrics.deadLetterJobs > 0)
    ) {
      systemStatus = 'degraded';
    }

    let queueStatus: 'healthy' | 'degraded' | 'unknown' = 'unknown';
    if (options?.queueMetrics) {
      queueStatus = options.queueMetrics.deadLetterJobs > 0 ? 'degraded' : 'healthy';
    }

    return {
      status: systemStatus,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round((Date.now() - this.startTime) / 10) / 100,
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        memory: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
          externalBytes: memory.external,
        },
      },
      http: {
        totalRequests: this.totalRequests,
        inFlightRequests: this.inFlight,
        totalErrors: this.totalErrors,
        errorRatePercentage: errorRate,
        statusCodes: { ...this.statusCodes },
        statusClasses: { ...this.statusClasses },
        methods: { ...this.methods },
        latencyMs: {
          average: avgLatency,
          min: this.latencyMin ?? 0,
          max: this.latencyMax,
          p50: percentiles.p50,
          p90: percentiles.p90,
          p99: percentiles.p99,
        },
      },
      dependencies: {
        database: {
          status: options?.dbStatus ?? 'unknown',
          ...(options?.dbLatencyMs !== undefined ? { latencyMs: options.dbLatencyMs } : {}),
        },
        redis: {
          status: options?.redisStatus ?? 'unknown',
          ...(options?.redisLatencyMs !== undefined ? { latencyMs: options.redisLatencyMs } : {}),
        },
      },
      ...(options?.queueMetrics
        ? {
            queue: {
              status: queueStatus,
              pendingJobs: options.queueMetrics.pendingJobs,
              retryingJobs: options.queueMetrics.retryingJobs,
              deadLetterJobs: options.queueMetrics.deadLetterJobs,
            },
          }
        : {}),
      ...(options?.activeConnections !== undefined
        ? {
            realtime: {
              activeConnections: options.activeConnections,
            },
          }
        : {}),
    };
  }

  public toPrometheusText(options?: MetricSnapshotOptions): string {
    const snapshot = this.getMetricsSnapshot(options);
    const lines: string[] = [];

    // HTTP Total Requests
    lines.push('# HELP worksphere_http_requests_total Total number of HTTP requests processed');
    lines.push('# TYPE worksphere_http_requests_total counter');
    lines.push(`worksphere_http_requests_total ${snapshot.http.totalRequests}`);

    // In-Flight Requests
    lines.push('# HELP worksphere_http_requests_in_flight Number of in-flight HTTP requests');
    lines.push('# TYPE worksphere_http_requests_in_flight gauge');
    lines.push(`worksphere_http_requests_in_flight ${snapshot.http.inFlightRequests}`);

    // Status Classes
    lines.push('# HELP worksphere_http_requests_by_status Total HTTP requests by status class');
    lines.push('# TYPE worksphere_http_requests_by_status counter');
    for (const [sClass, count] of Object.entries(snapshot.http.statusClasses)) {
      lines.push(`worksphere_http_requests_by_status{status_class="${sClass}"} ${count}`);
    }

    // Methods
    if (Object.keys(snapshot.http.methods).length > 0) {
      lines.push('# HELP worksphere_http_requests_by_method Total HTTP requests by method');
      lines.push('# TYPE worksphere_http_requests_by_method counter');
      for (const [method, count] of Object.entries(snapshot.http.methods)) {
        lines.push(`worksphere_http_requests_by_method{method="${method}"} ${count}`);
      }
    }

    // Errors
    lines.push('# HELP worksphere_http_errors_total Total HTTP 4xx and 5xx error responses');
    lines.push('# TYPE worksphere_http_errors_total counter');
    lines.push(`worksphere_http_errors_total ${snapshot.http.totalErrors}`);

    lines.push('# HELP worksphere_http_error_rate_percentage HTTP error rate percentage');
    lines.push('# TYPE worksphere_http_error_rate_percentage gauge');
    lines.push(`worksphere_http_error_rate_percentage ${snapshot.http.errorRatePercentage}`);

    // Latency
    lines.push('# HELP worksphere_http_response_time_ms_avg Average HTTP response duration in ms');
    lines.push('# TYPE worksphere_http_response_time_ms_avg gauge');
    lines.push(`worksphere_http_response_time_ms_avg ${snapshot.http.latencyMs.average}`);

    lines.push('# HELP worksphere_http_response_time_ms_max Maximum HTTP response duration in ms');
    lines.push('# TYPE worksphere_http_response_time_ms_max gauge');
    lines.push(`worksphere_http_response_time_ms_max ${snapshot.http.latencyMs.max}`);

    lines.push('# HELP worksphere_http_response_time_ms Response duration percentiles in ms');
    lines.push('# TYPE worksphere_http_response_time_ms gauge');
    lines.push(`worksphere_http_response_time_ms{quantile="0.5"} ${snapshot.http.latencyMs.p50}`);
    lines.push(`worksphere_http_response_time_ms{quantile="0.9"} ${snapshot.http.latencyMs.p90}`);
    lines.push(`worksphere_http_response_time_ms{quantile="0.99"} ${snapshot.http.latencyMs.p99}`);

    // Database
    lines.push('# HELP worksphere_database_up Database connectivity status (1 = up, 0 = down)');
    lines.push('# TYPE worksphere_database_up gauge');
    lines.push(`worksphere_database_up ${snapshot.dependencies.database.status === 'up' ? 1 : 0}`);

    if (snapshot.dependencies.database.latencyMs !== undefined) {
      lines.push('# HELP worksphere_database_latency_ms Database ping latency in milliseconds');
      lines.push('# TYPE worksphere_database_latency_ms gauge');
      lines.push(`worksphere_database_latency_ms ${snapshot.dependencies.database.latencyMs}`);
    }

    // Redis
    lines.push('# HELP worksphere_redis_up Redis connectivity status (1 = up, 0 = down)');
    lines.push('# TYPE worksphere_redis_up gauge');
    lines.push(`worksphere_redis_up ${snapshot.dependencies.redis.status === 'up' ? 1 : 0}`);

    if (snapshot.dependencies.redis.latencyMs !== undefined) {
      lines.push('# HELP worksphere_redis_latency_ms Redis ping latency in milliseconds');
      lines.push('# TYPE worksphere_redis_latency_ms gauge');
      lines.push(`worksphere_redis_latency_ms ${snapshot.dependencies.redis.latencyMs}`);
    }

    // Queue
    if (snapshot.queue) {
      lines.push('# HELP worksphere_queue_pending_jobs Number of pending outbox background jobs');
      lines.push('# TYPE worksphere_queue_pending_jobs gauge');
      lines.push(`worksphere_queue_pending_jobs ${snapshot.queue.pendingJobs}`);

      lines.push('# HELP worksphere_queue_retrying_jobs Number of retrying outbox background jobs');
      lines.push('# TYPE worksphere_queue_retrying_jobs gauge');
      lines.push(`worksphere_queue_retrying_jobs ${snapshot.queue.retryingJobs}`);

      lines.push('# HELP worksphere_queue_dead_letter_jobs Number of dead-letter outbox jobs');
      lines.push('# TYPE worksphere_queue_dead_letter_jobs gauge');
      lines.push(`worksphere_queue_dead_letter_jobs ${snapshot.queue.deadLetterJobs}`);
    }

    // Realtime
    if (snapshot.realtime !== undefined) {
      lines.push('# HELP worksphere_realtime_connections Active Server-Sent Event client connections');
      lines.push('# TYPE worksphere_realtime_connections gauge');
      lines.push(`worksphere_realtime_connections ${snapshot.realtime.activeConnections}`);
    }

    // System Uptime & Memory
    lines.push('# HELP process_uptime_seconds API process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds counter');
    lines.push(`process_uptime_seconds ${snapshot.uptimeSeconds}`);

    lines.push('# HELP process_resident_memory_bytes Resident set size memory in bytes');
    lines.push('# TYPE process_resident_memory_bytes gauge');
    lines.push(`process_resident_memory_bytes ${snapshot.process.memory.rssBytes}`);

    lines.push('# HELP nodejs_heap_size_used_bytes Node.js heap memory used in bytes');
    lines.push('# TYPE nodejs_heap_size_used_bytes gauge');
    lines.push(`nodejs_heap_size_used_bytes ${snapshot.process.memory.heapUsedBytes}`);

    return lines.join('\n') + '\n';
  }

  public reset(): void {
    this.startTime = Date.now();
    this.inFlight = 0;
    this.totalRequests = 0;
    this.totalErrors = 0;
    this.totalServerErrors = 0;
    this.statusCodes = {};
    this.statusClasses = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
    this.methods = {};
    this.latencySamples = [];
    this.latencySum = 0;
    this.latencyMin = null;
    this.latencyMax = 0;
  }
}
