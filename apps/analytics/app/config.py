from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import AnyUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    database_url: AnyUrl
    redis_url: AnyUrl
    analytics_port: int = 8000
    analytics_service_token: str | None = None

    @property
    def asyncpg_database_url(self) -> str:
        parts = urlsplit(str(self.database_url))
        query = urlencode([(key, value) for key, value in parse_qsl(parts.query) if key != 'schema'])
        return urlunsplit(parts._replace(query=query))

