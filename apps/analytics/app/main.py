import asyncio
import asyncpg
from pydantic import BaseModel, Field
from fastapi import FastAPI, Header, HTTPException, Response, status
from redis.asyncio import Redis
from .config import Settings

app = FastAPI(title='WorkSphere Analytics', version='0.1.0', docs_url='/docs', redoc_url='/redoc')

class TaskSnapshot(BaseModel):
    status: str = Field(min_length=1, max_length=32)
    estimate_hours: float = Field(default=0, ge=0)
    cycle_days: float | None = Field(default=None, ge=0)
    due_date: str | None = None

class AnalyticsRequest(BaseModel):
    tasks: list[TaskSnapshot] = Field(max_length=10000)

def require_service_token(x_service_token: str | None = Header(default=None)) -> None:
    expected = Settings().analytics_service_token
    if expected and x_service_token != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid service token')

@app.post('/api/v1/analytics/projects')
async def project_analytics(payload: AnalyticsRequest, x_service_token: str | None = Header(default=None)) -> dict[str, object]:
    """Calculate project health from a bounded, validated task snapshot."""
    require_service_token(x_service_token)
    from collections import Counter
    from statistics import mean

    counts = Counter(task.status.lower() for task in payload.tasks)
    completed = [task for task in payload.tasks if task.status.lower() in {'done', 'completed'}]
    durations = [task.cycle_days for task in completed if task.cycle_days is not None]
    total = len(payload.tasks)
    return {
        'total_tasks': total,
        'by_status': dict(sorted(counts.items())),
        'completion_rate': round(len(completed) / total, 4) if total else 0,
        'estimated_hours': round(sum(task.estimate_hours for task in payload.tasks), 2),
        'average_cycle_days': round(mean(durations), 2) if durations else None,
    }

@app.get('/health')
async def health() -> dict[str, str]:
    return {'status': 'ok', 'service': 'analytics'}

@app.get('/ready')
async def ready(response: Response) -> dict[str, object]:
    settings = Settings()
    db = None
    redis = None
    try:
        db = await asyncpg.connect(settings.asyncpg_database_url)
        redis = Redis.from_url(str(settings.redis_url))
        await asyncio.gather(db.execute('SELECT 1'), redis.ping())
        return {'status': 'ready', 'checks': {'database': 'ok', 'redis': 'ok'}}
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {'status': 'unavailable', 'checks': {'database': 'unavailable', 'redis': 'unavailable'}}
    finally:
        if db is not None:
            await db.close()
        if redis is not None:
            await redis.aclose()
