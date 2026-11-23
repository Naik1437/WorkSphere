"""
Automated verification for 100,000-row streaming benchmark (A05-R07).
"""

from datetime import date
from benchmark_100k import run_benchmark, StreamingCsvBuffer


def test_streaming_csv_buffer_generation():
    """Verify StreamingCsvBuffer produces headers and formatted rows."""
    stream = StreamingCsvBuffer(total_rows=10)
    lines = list(stream)
    assert len(lines) == 11  # 1 header + 10 rows
    assert lines[0] == "status,due_date,completed_at\n"
    assert "done" in lines[1]


def test_benchmark_100k_execution_and_accuracy():
    """Verify that 100,000 rows are processed accurately with bounded memory."""
    ref_date = date(2026, 11, 23)
    metrics = run_benchmark(total_rows=100_000, reference_date=ref_date)

    assert metrics["total_rows"] == 100_000
    assert metrics["duration_seconds"] > 0
    assert metrics["throughput_rows_per_sec"] > 0

    # Memory must be bounded (less than 5 MB peak for 100k rows)
    assert metrics["peak_memory_mb"] < 5.0

    res = metrics["result"]
    assert res["total"] == 100_000
    assert res["by_status"] == {
        "blocked": 10_000,
        "done": 40_000,
        "in_progress": 30_000,
        "open": 20_000,
    }
    assert res["overdue"] == 30_000
