import prisma from '../lib/prisma.js';
import { createChildLogger } from '../lib/logger.js';
import { scheduleReminderJob, cancelReminderJob } from '../lib/queue.js';
import type { Reminder, ReminderState } from '@prisma/client';

const logger = createChildLogger('reminder-service');

export async function getReminderById(id: string): Promise<Reminder | null> {
  return prisma.reminder.findUnique({
    where: { id },
    include: {
      task: true,
      user: true,
    },
  });
}

export async function getDueReminders(): Promise<Reminder[]> {
  return prisma.reminder.findMany({
    where: {
      scheduledAt: {
        lte: new Date(),
      },
      state: 'SCHEDULED',
    },
    include: {
      task: true,
      user: true,
    },
    orderBy: {
      scheduledAt: 'asc',
    },
    take: 100, // Process in batches
  });
}

export async function updateReminderState(
  id: string,
  state: ReminderState,
  updates?: {
    sentAt?: Date;
    messageId?: string;
    lastError?: string;
  }
): Promise<Reminder> {
  const data: {
    state: ReminderState;
    sentAt?: Date;
    messageId?: string;
    lastError?: string;
    retriesCount?: { increment: number };
  } = { state };

  if (updates?.sentAt) data.sentAt = updates.sentAt;
  if (updates?.messageId) data.messageId = updates.messageId;
  if (updates?.lastError) {
    data.lastError = updates.lastError;
    data.retriesCount = { increment: 1 };
  }

  const reminder = await prisma.reminder.update({
    where: { id },
    data,
  });

  logger.info({ reminderId: id, state }, 'Updated reminder state');
  return reminder;
}

export async function markReminderSent(
  id: string,
  messageId?: string,
  deliveryMode?: 'SESSION_FREEFORM' | 'TEMPLATE'
): Promise<Reminder> {
  return prisma.reminder.update({
    where: { id },
    data: {
      state: 'SENT',
      sentAt: new Date(),
      messageId,
      deliveryMode: deliveryMode || undefined,
    },
  });
}

export async function markReminderAcked(
  id: string,
  action: 'done' | 'snooze'
): Promise<Reminder> {
  return prisma.reminder.update({
    where: { id },
    data: {
      state: action === 'done' ? 'ACKED_DONE' : 'ACKED_SNOOZE',
    },
  });
}

export async function markReminderFailed(id: string, error: string): Promise<Reminder> {
  return prisma.reminder.update({
    where: { id },
    data: {
      state: 'FAILED',
      lastError: error,
      retriesCount: { increment: 1 },
    },
  });
}

export async function cancelReminder(id: string): Promise<Reminder> {
  await cancelReminderJob(id);
  return prisma.reminder.update({
    where: { id },
    data: { state: 'CANCELED' },
  });
}

export async function rescheduleReminder(
  id: string,
  newScheduledAt: Date
): Promise<Reminder> {
  // Cancel old job
  await cancelReminderJob(id);

  // Update reminder
  const reminder = await prisma.reminder.update({
    where: { id },
    data: {
      scheduledAt: newScheduledAt,
      state: 'SCHEDULED',
    },
    include: {
      task: true,
    },
  });

  // Schedule new job
  await scheduleReminderJob(id, reminder.taskId, reminder.userId, newScheduledAt);

  logger.info({ reminderId: id, newScheduledAt }, 'Rescheduled reminder');
  return reminder;
}

export async function getRecentSentReminder(
  userId: string,
  taskId?: string
): Promise<Reminder | null> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  return prisma.reminder.findFirst({
    where: {
      userId,
      ...(taskId && { taskId }),
      state: 'SENT',
      sentAt: {
        gte: fiveMinutesAgo,
      },
    },
    orderBy: {
      sentAt: 'desc',
    },
    include: {
      task: true,
    },
  });
}

export async function getStuckReminders(): Promise<Reminder[]> {
  // Find reminders that are past due but still scheduled
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

  return prisma.reminder.findMany({
    where: {
      scheduledAt: {
        lte: fiveMinutesAgo,
      },
      state: 'SCHEDULED',
    },
    include: {
      task: true,
      user: true,
    },
    take: 50,
  });
}
