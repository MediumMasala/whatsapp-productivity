import cron from 'node-cron';
import { createChildLogger } from '../lib/logger.js';
import * as reminderService from '../services/reminder.service.js';
import { scheduleReminderJob } from '../lib/queue.js';

const logger = createChildLogger('sweeper');

export function startSweeper(): cron.ScheduledTask {
  // Run every 5 minutes
  const task = cron.schedule('*/5 * * * *', async () => {
    logger.info('Running reminder sweeper');

    try {
      // Find stuck reminders
      const stuckReminders = await reminderService.getStuckReminders();

      if (stuckReminders.length === 0) {
        logger.debug('No stuck reminders found');
        return;
      }

      logger.info({ count: stuckReminders.length }, 'Found stuck reminders, re-scheduling');

      for (const reminder of stuckReminders) {
        try {
          // Re-schedule the job
          await scheduleReminderJob(
            reminder.id,
            reminder.taskId,
            reminder.userId,
            new Date() // Schedule for immediate execution
          );

          logger.info({ reminderId: reminder.id }, 'Re-scheduled stuck reminder');
        } catch (error) {
          logger.error({ error, reminderId: reminder.id }, 'Failed to re-schedule reminder');
        }
      }
    } catch (error) {
      logger.error({ error }, 'Sweeper error');
    }
  });

  logger.info('Sweeper started (runs every 5 minutes)');

  return task;
}

// Also expose a function to run the sweeper manually (for testing)
export async function runSweeperOnce(): Promise<number> {
  logger.info('Running sweeper manually');

  const stuckReminders = await reminderService.getStuckReminders();

  for (const reminder of stuckReminders) {
    await scheduleReminderJob(
      reminder.id,
      reminder.taskId,
      reminder.userId,
      new Date()
    );
  }

  return stuckReminders.length;
}
