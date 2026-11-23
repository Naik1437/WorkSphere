import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32).default('local-development-secret-change-before-deploy'),
  ANALYTICS_SERVICE_URL: z.string().url().default('http://127.0.0.1:8000'),
  ANALYTICS_SERVICE_TOKEN: z.string().optional(),
});

export type Config = z.infer<typeof schema>;
export const loadConfig = (environment = process.env): Config => schema.parse(environment);
