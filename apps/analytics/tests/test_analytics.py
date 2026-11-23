from fastapi.testclient import TestClient

from app.main import app


def test_project_analytics_returns_project_metrics(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test')
    monkeypatch.setenv('REDIS_URL', 'redis://localhost:6379')
    response = TestClient(app).post('/api/v1/analytics/projects', json={
        'tasks': [
            {'status': 'done', 'estimate_hours': 3, 'cycle_days': 2},
            {'status': 'in_progress', 'estimate_hours': 5},
        ]
    })
    assert response.status_code == 200
    assert response.json()['completion_rate'] == 0.5
    assert response.json()['average_cycle_days'] == 2


def test_project_analytics_requires_configured_service_token(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test')
    monkeypatch.setenv('REDIS_URL', 'redis://localhost:6379')
    monkeypatch.setenv('ANALYTICS_SERVICE_TOKEN', 'secret')
    response = TestClient(app).post('/api/v1/analytics/projects', json={'tasks': []})
    assert response.status_code == 401
