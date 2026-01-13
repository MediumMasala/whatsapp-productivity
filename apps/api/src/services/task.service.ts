import prisma from '../lib/prisma.js';
import { createChildLogger } from '../lib/logger.js';
import { scheduleReminderJob, cancelReminderJob } from '../lib/queue.js';
import type { Task, TaskStatus, TaskSource, Prisma } from '@prisma/client';

const logger = createChildLogger('task-service');

export interface CreateTaskInput {
  userId: string;
  title: string;
  notes?: string;
  status?: TaskStatus;
  dueAt?: Date;
  reminderAt?: Date;
  recurrence?: string;
  source?: TaskSource;
  externalRef?: string;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  status?: TaskStatus;
  dueAt?: Date | null;
  reminderAt?: Date | null;
  recurrence?: string | null;
}

export interface TaskFilters {
  status?: TaskStatus;
  q?: string;
  page?: number;
  pageSize?: number;
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const task = await prisma.task.create({
    data: {
      userId: input.userId,
      title: input.title,
      notes: input.notes,
      status: input.status || 'TODO',
      dueAt: input.dueAt,
      reminderAt: input.reminderAt,
      recurrence: input.recurrence,
      source: input.source || 'WEB',
      externalRef: input.externalRef,
    },
  });

  logger.info({ taskId: task.id, userId: input.userId, title: input.title }, 'Created task');

  // Schedule reminder if set
  if (task.reminderAt && task.status !== 'DONE') {
    await scheduleReminder(task);
  }

  return task;
}

export async function getTaskById(taskId: string): Promise<Task | null> {
  return prisma.task.findUnique({
    where: { id: taskId },
  });
}

export async function getTasksByUser(
  userId: string,
  filters: TaskFilters = {}
): Promise<{ tasks: Task[]; total: number }> {
  const { status, q, page = 1, pageSize = 20 } = filters;

  const where: Prisma.TaskWhereInput = {
    userId,
    ...(status && { status }),
    ...(q && {
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ],
    }),
  };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy: [
        { status: 'asc' },
        { reminderAt: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.task.count({ where }),
  ]);

  return { tasks, total };
}

export async function getTasksByStatus(userId: string, status: TaskStatus): Promise<Task[]> {
  return prisma.task.findMany({
    where: { userId, status },
    orderBy: [
      { reminderAt: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'desc' },
    ],
  });
}

export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<Task> {
  const existingTask = await getTaskById(taskId);
  if (!existingTask) {
    throw new Error('Task not found');
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: input,
  });

  logger.info({ taskId, changes: Object.keys(input) }, 'Updated task');

  // Handle reminder changes
  if ('reminderAt' in input || 'status' in input) {
    // Cancel existing reminders
    await cancelTaskReminders(taskId);

    // Schedule new reminder if applicable
    if (task.reminderAt && task.status !== 'DONE') {
      await scheduleReminder(task);
    }
  }

  return task;
}

export async function moveTask(taskId: string, status: TaskStatus): Promise<Task> {
  const task = await updateTask(taskId, { status });

  // If moved to DONE, cancel all reminders
  if (status === 'DONE') {
    await cancelTaskReminders(taskId);
  }

  return task;
}

export async function markTaskDone(taskId: string): Promise<Task> {
  return moveTask(taskId, 'DONE');
}

export async function deleteTask(taskId: string): Promise<void> {
  await cancelTaskReminders(taskId);
  await prisma.task.delete({
    where: { id: taskId },
  });
  logger.info({ taskId }, 'Deleted task');
}

async function scheduleReminder(task: Task): Promise<void> {
  if (!task.reminderAt) return;

  const reminder = await prisma.reminder.create({
    data: {
      taskId: task.id,
      userId: task.userId,
      scheduledAt: task.reminderAt,
      state: 'SCHEDULED',
    },
  });

  await scheduleReminderJob(reminder.id, task.id, task.userId, task.reminderAt);
}

async function cancelTaskReminders(taskId: string): Promise<void> {
  const reminders = await prisma.reminder.findMany({
    where: {
      taskId,
      state: 'SCHEDULED',
    },
  });

  for (const reminder of reminders) {
    await cancelReminderJob(reminder.id);
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { state: 'CANCELED' },
    });
  }
}

export async function snoozeTask(
  taskId: string,
  minutes: number
): Promise<{ task: Task; reminder: Awaited<ReturnType<typeof prisma.reminder.create>> }> {
  const newReminderAt = new Date(Date.now() + minutes * 60 * 1000);

  // Cancel existing reminders
  await cancelTaskReminders(taskId);

  // Update task
  const task = await prisma.task.update({
    where: { id: taskId },
    data: { reminderAt: newReminderAt },
  });

  // Create new reminder
  const reminder = await prisma.reminder.create({
    data: {
      taskId,
      userId: task.userId,
      scheduledAt: newReminderAt,
      state: 'SCHEDULED',
    },
  });

  await scheduleReminderJob(reminder.id, taskId, task.userId, newReminderAt);

  logger.info({ taskId, minutes, newReminderAt }, 'Snoozed task');

  return { task, reminder };
}

export async function getUpcomingReminders(
  userId: string,
  limit: number = 5
): Promise<(Task & { reminder: { scheduledAt: Date } | null })[]> {
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      status: 'TODO',
      reminderAt: {
        gte: new Date(),
      },
    },
    orderBy: {
      reminderAt: 'asc',
    },
    take: limit,
    include: {
      reminders: {
        where: { state: 'SCHEDULED' },
        orderBy: { scheduledAt: 'asc' },
        take: 1,
      },
    },
  });

  return tasks.map((t) => ({
    ...t,
    reminder: t.reminders[0] || null,
  }));
}
