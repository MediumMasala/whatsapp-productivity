import { Queue, Worker, Job } from 'bullmq';
import redis from './redis.js';
import { createChildLogger } from './logger.js';

const logger = createChildLogger('queue');

// Queue names
export const REMINDER_QUEUE = 'reminders';

// Create the reminder queue
export const reminderQueue = new Queue(REMINDER_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

// Job data types
export interface ReminderJobData {
  reminderId: string;
  taskId: string;
  userId: string;
}

// Schedule a reminder job
export async function scheduleReminderJob(
  reminderId: string,
  taskId: string,
  userId: string,
  scheduledAt: Date
): Promise<string> {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());

  const job = await reminderQueue.add(
    'send-reminder',
    { reminderId, taskId, userId } satisfies ReminderJobData,
    {
      delay,
      jobId: `reminder-${reminderId}`,
    }
  );

  logger.info({ reminderId, taskId, delay }, 'Scheduled reminder job');
  return job.id || reminderId;
}

// Cancel a reminder job
export async function cancelReminderJob(reminderId: string): Promise<boolean> {
  const jobId = `reminder-${reminderId}`;
  const job = await reminderQueue.getJob(jobId);

  if (job) {
    await job.remove();
    logger.info({ reminderId }, 'Cancelled reminder job');
    return true;
  }

  return false;
}

// Get queue stats
export async function getQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    reminderQueue.getWaitingCount(),
    reminderQueue.getActiveCount(),
    reminderQueue.getCompletedCount(),
    reminderQueue.getFailedCount(),
    reminderQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
  };
}

export { Worker, Job };
