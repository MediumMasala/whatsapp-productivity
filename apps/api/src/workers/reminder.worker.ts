import { Worker, Job } from '../lib/queue.js';
import redis from '../lib/redis.js';
import { createChildLogger } from '../lib/logger.js';
import prisma from '../lib/prisma.js';
import * as reminderService from '../services/reminder.service.js';
import * as whatsappService from '../services/whatsapp.service.js';
import { MAX_REMINDER_RETRIES } from '@whatsapp-productivity/shared';
import type { ReminderJobData } from '../lib/queue.js';

const logger = createChildLogger('reminder-worker');

export function startReminderWorker(): Worker | null {
  if (!redis) {
    logger.warn('Redis not available, reminder worker not started');
    return null;
  }

  const worker = new Worker<ReminderJobData>(
    'reminders',
    async (job: Job<ReminderJobData>) => {
      const { reminderId, taskId, userId } = job.data;

      logger.info({ reminderId, taskId, attempt: job.attemptsMade + 1 }, 'Processing reminder');

      try {
        // Get reminder with task and user
        const reminder = await prisma.reminder.findUnique({
          where: { id: reminderId },
          include: {
            task: true,
            user: true,
          },
        });

        if (!reminder) {
          logger.warn({ reminderId }, 'Reminder not found, skipping');
          return;
        }

        // Check if reminder is still scheduled
        if (reminder.state !== 'SCHEDULED') {
          logger.info({ reminderId, state: reminder.state }, 'Reminder not in SCHEDULED state, skipping');
          return;
        }

        // Check if task still exists and is not done
        if (!reminder.task || reminder.task.status === 'DONE') {
          logger.info({ reminderId, taskId }, 'Task is done or deleted, canceling reminder');
          await reminderService.updateReminderState(reminderId, 'CANCELED');
          return;
        }

        // Check retry count
        if (reminder.retriesCount >= MAX_REMINDER_RETRIES) {
          logger.warn({ reminderId, retries: reminder.retriesCount }, 'Max retries exceeded, marking failed');
          await reminderService.markReminderFailed(reminderId, 'Max retries exceeded');
          return;
        }

        // Send the reminder message
        const { result, deliveryMode } = await whatsappService.sendReminderMessage(
          reminder.user,
          reminder.task
        );

        if (result.success) {
          await reminderService.markReminderSent(reminderId, result.messageId, deliveryMode);
          logger.info({ reminderId, messageId: result.messageId, deliveryMode }, 'Reminder sent successfully');

          // Log the outbound message
          await whatsappService.logMessageEvent(userId, 'OUTBOUND', {
            type: 'reminder',
            taskId,
            messageId: result.messageId,
            deliveryMode,
          });
        } else {
          throw new Error(result.error || 'Unknown error sending reminder');
        }
      } catch (error) {
        logger.error({ error, reminderId }, 'Error processing reminder');

        // Update reminder with error
        await reminderService.updateReminderState(reminderId, 'SCHEDULED', {
          lastError: String(error),
        });

        // Re-throw to trigger retry
        throw error;
      }
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Reminder job completed');
  });

  worker.on('failed', (job, error) => {
    logger.error({ jobId: job?.id, error }, 'Reminder job failed');
  });

  worker.on('error', (error) => {
    logger.error({ error }, 'Worker error');
  });

  logger.info('Reminder worker started');

  return worker;
}
