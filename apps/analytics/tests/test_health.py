from fastapi.testclient import TestClient
from app.main import app

def test_health_reports_analytics_liveness():
    response = TestClient(app).get('/health')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'service': 'analytics'}


def test_ready_reports_structured_checks():
    response = TestClient(app).get('/ready')
    assert response.status_code in {200, 503}
    assert 'checks' in response.json()
    assert 'database' in response.json()['checks']
    assert 'redis' in response.json()['checks']


