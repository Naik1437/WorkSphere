"""Streaming task activity report helpers; uses only the Python standard library."""

import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path
from typing import TextIO


def summarize_activity(source: TextIO, today: date | None = None) -> dict[str, object]:
    """Summarize CSV rows incrementally. Expected columns: status, due_date, completed_at."""
    today = today or date.today()
    totals: Counter[str] = Counter()
    overdue = 0
    for row in csv.DictReader(source):
        status = (row.get('status') or '').strip().lower()
        due_text = (row.get('due_date') or '').strip()
        if not status:
            raise ValueError('Each row must include a status')
        totals[status] += 1
        if due_text and status not in {'done', 'completed', 'cancelled'}:
            try:
                overdue += date.fromisoformat(due_text) < today
            except ValueError as exc:
                raise ValueError('due_date must use YYYY-MM-DD') from exc
    return {'total': sum(totals.values()), 'by_status': dict(sorted(totals.items())), 'overdue': overdue}


def write_report(source: TextIO, destination: str | Path, today: date | None = None) -> dict[str, object]:
    report = summarize_activity(source, today)
    Path(destination).write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    return report
