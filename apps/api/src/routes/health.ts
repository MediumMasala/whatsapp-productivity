import type { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import redis from '../lib/redis.js';
import { getQueueStats } from '../lib/queue.js';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Basic health check
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });

  // Detailed health check
  fastify.get('/health/detailed', async (request, reply) => {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};

    // Check database
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latency: Date.now() - dbStart };
    } catch (error) {
      checks.database = { status: 'error', error: String(error) };
    }

    // Check Redis
    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: 'ok', latency: Date.now() - redisStart };
    } catch (error) {
      checks.redis = { status: 'error', error: String(error) };
    }

    const allOk = Object.values(checks).every((c) => c.status === 'ok');

    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // Metrics endpoint
  fastify.get('/metrics', async (request, reply) => {
    const queueStats = await getQueueStats();

    const [userCount, taskCount, reminderCount] = await Promise.all([
      prisma.user.count(),
      prisma.task.count(),
      prisma.reminder.count({ where: { state: 'SCHEDULED' } }),
    ]);

    return reply.send({
      timestamp: new Date().toISOString(),
      database: {
        users: userCount,
        tasks: taskCount,
        scheduledReminders: reminderCount,
      },
      queue: queueStats,
    });
  });
}
