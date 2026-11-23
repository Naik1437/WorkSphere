from datetime import date
from io import StringIO

import pytest

from app.activity_report import summarize_activity


def test_summarizes_and_counts_overdue_without_materializing_rows():
    data = StringIO('status,due_date,completed_at\nopen,2025-01-01,\ndone,2025-01-01,2025-01-02\nopen,,\n')
    assert summarize_activity(data, date(2025, 1, 2)) == {
        'total': 3, 'by_status': {'done': 1, 'open': 2}, 'overdue': 1
    }


def test_rejects_invalid_dates_and_missing_status():
    with pytest.raises(ValueError, match='YYYY-MM-DD'):
        summarize_activity(StringIO('status,due_date\nopen,yesterday\n'))
    with pytest.raises(ValueError, match='status'):
        summarize_activity(StringIO('status,due_date\n,\n'))
