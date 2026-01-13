import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import { config } from './lib/config.js';
import { logger } from './lib/logger.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { taskRoutes } from './routes/tasks.js';
import { userRoutes } from './routes/users.js';
import { whatsappRoutes } from './routes/whatsapp.js';
import { activityRoutes } from './routes/activity.js';
import { startReminderWorker } from './workers/reminder.worker.js';
import { startSweeper } from './workers/sweeper.js';

async function main() {
  const fastify = Fastify({
    logger: logger,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false,
  });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await fastify.register(jwt, {
    secret: config.jwtSecret,
  });

  // Add raw body for webhook signature verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        const json = JSON.parse(body as string);
        (req as typeof req & { rawBody: string }).rawBody = body as string;
        done(null, json);
      } catch (error) {
        done(error as Error, undefined);
      }
    }
  );

  // Register routes
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes);
  await fastify.register(taskRoutes);
  await fastify.register(userRoutes);
  await fastify.register(whatsappRoutes);
  await fastify.register(activityRoutes);

  // Start workers
  const reminderWorker = startReminderWorker();
  const sweeper = startSweeper();

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');

    sweeper.stop();
    await reminderWorker.close();
    await fastify.close();

    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Start server
  try {
    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    logger.info(`Server running at http://${config.host}:${config.port}`);
    logger.info('Reminder worker and sweeper started');
  } catch (error) {
    logger.error(error);
    process.exit(1);
  }
}

main();
