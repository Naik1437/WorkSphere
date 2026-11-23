import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const prisma = new PrismaClient();
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
const app = createApp(config, {
  database: prisma,
  authSecret: config.AUTH_SECRET,
  databasePing: async () => {
    await prisma.$queryRawUnsafe('SELECT 1');
  },
  redisPing: async () => {
    if (redis.status === 'wait') await redis.connect();
    await redis.ping();
  },
});
const server = app.listen(config.API_PORT, () =>
  console.log(`API listening on ${config.API_PORT}`),
);
async function shutdown() {
  server.close();
  (app as any).events?.close();
  await Promise.all([prisma.$disconnect(), redis.quit()]);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
