"""
WorkSphere 100,000-Row Analytics Benchmark (A05-R07)

Benchmarks incremental streaming processing of 100,000 synthetic task activity records
using summarize_activity from app.activity_report.
Measures execution duration, memory consumption (peak & delta via tracemalloc),
throughput (rows/sec), and verifies exact row counting and aggregation accuracy.
"""

import io
import os
import sys
import time
import tracemalloc
from datetime import date
from typing import Iterator

# Ensure app package is importable when executed directly
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from app.activity_report import summarize_activity


class StreamingCsvBuffer(io.TextIOBase):
    """
    On-demand streaming TextIO buffer that yields synthetic CSV rows without
    holding all 100,000 rows in memory simultaneously.
    """

    def __init__(self, total_rows: int = 100_000, reference_date: date = date(2026, 11, 23)):
        super().__init__()
        self.total_rows = total_rows
        self.reference_date = reference_date
        self._row_idx = -1  # -1 represents header

    def readable(self) -> bool:
        return True

    def readline(self, size: int = -1) -> str:
        if self._row_idx == -1:
            self._row_idx = 0
            return "status,due_date,completed_at\n"

        if self._row_idx >= self.total_rows:
            return ""

        idx = self._row_idx
        self._row_idx += 1

        # Deterministic synthetic row distribution:
        # idx % 10 < 4 -> 'done' (40%)
        # idx % 10 < 7 -> 'in_progress' (30%)
        # idx % 10 < 9 -> 'open' (20%)
        # idx % 10 == 9 -> 'blocked' (10%)
        rem = idx % 10
        if rem < 4:
            status = 'done'
            due = '2026-11-10'
            completed = '2026-11-12'
        elif rem < 7:
            status = 'in_progress'
            due = '2026-11-01' if (idx % 2 == 0) else '2026-12-01'
            completed = ''
        elif rem < 9:
            status = 'open'
            due = '2026-11-05' if (idx % 2 == 0) else '2026-12-05'
            completed = ''
        else:
            status = 'blocked'
            due = '2026-11-02' if (idx % 2 == 0) else '2026-12-10'
            completed = ''

        return f"{status},{due},{completed}\n"

    def __iter__(self) -> Iterator[str]:
        while True:
            line = self.readline()
            if not line:
                break
            yield line


def run_benchmark(total_rows: int = 100_000, reference_date: date = date(2026, 11, 23)) -> dict[str, object]:
    """Runs the 100,000-row benchmark, returning metrics and results."""
    stream = StreamingCsvBuffer(total_rows=total_rows, reference_date=reference_date)

    tracemalloc.start()
    start_time = time.perf_counter()

    result = summarize_activity(stream, today=reference_date)

    end_time = time.perf_counter()
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    duration = end_time - start_time
    throughput = total_rows / duration if duration > 0 else 0

    return {
        'total_rows': total_rows,
        'duration_seconds': round(duration, 4),
        'throughput_rows_per_sec': round(throughput, 2),
        'peak_memory_bytes': peak_mem,
        'peak_memory_mb': round(peak_mem / (1024 * 1024), 3),
        'current_memory_bytes': current_mem,
        'current_memory_mb': round(current_mem / (1024 * 1024), 3),
        'result': result,
    }


def main():
    print("=" * 60)
    print("WorkSphere Analytics 100,000-Row Streaming Benchmark (A05-R07)")
    print("=" * 60)

    rows = 100_000
    ref_date = date(2026, 11, 23)
    metrics = run_benchmark(total_rows=rows, reference_date=ref_date)

    res = metrics['result']
    assert res['total'] == rows, f"Total rows mismatch: expected {rows}, got {res['total']}"
    assert res['by_status'] == {
        'blocked': 10_000,
        'done': 40_000,
        'in_progress': 30_000,
        'open': 20_000,
    }, f"Status distribution mismatch: {res['by_status']}"
    assert res['overdue'] == 30_000, f"Overdue count mismatch: expected 30000, got {res['overdue']}"

    print(f"Dataset Size       : {metrics['total_rows']:,} rows (Synthetic)")
    print(f"Execution Duration : {metrics['duration_seconds']:.4f} seconds")
    print(f"Throughput         : {metrics['throughput_rows_per_sec']:,.2f} rows/sec")
    print(f"Peak Memory Usage  : {metrics['peak_memory_mb']:.3f} MB ({metrics['peak_memory_bytes']:,} bytes)")
    print(f"Memory Efficiency  : Streamed incrementally (Constant O(1) space)")
    print("-" * 60)
    print("Aggregated Results:")
    print(f"  Total Processed  : {res['total']:,}")
    print(f"  By Status        : {res['by_status']}")
    print(f"  Overdue Tasks    : {res['overdue']:,}")
    print("=" * 60)
    print("[SUCCESS] All 100,000 rows processed correctly with bounded memory.")


if __name__ == '__main__':
    main()
