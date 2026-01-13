import type { FastifyInstance } from 'fastify';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  TaskQuerySchema,
  SnoozeRequestSchema,
} from '@whatsapp-productivity/shared';
import * as taskService from '../services/task.service.js';
import * as userService from '../services/user.service.js';
import * as whatsappService from '../services/whatsapp.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { createChildLogger } from '../lib/logger.js';

const logger = createChildLogger('task-routes');

export async function taskRoutes(fastify: FastifyInstance): Promise<void> {
  // Get all tasks
  fastify.get(
    '/tasks',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const query = TaskQuerySchema.safeParse(request.query);

      if (!query.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid query parameters',
          details: query.error.format(),
        });
      }

      const { tasks, total } = await taskService.getTasksByUser(
        request.userId!,
        query.data
      );

      return reply.send({
        success: true,
        data: {
          items: tasks,
          total,
          page: query.data.page,
          pageSize: query.data.pageSize,
          hasMore: total > query.data.page * query.data.pageSize,
        },
      });
    }
  );

  // Create task
  fastify.post(
    '/tasks',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const result = CreateTaskSchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid task data',
          details: result.error.format(),
        });
      }

      const task = await taskService.createTask({
        userId: request.userId!,
        title: result.data.title,
        notes: result.data.notes,
        status: result.data.status,
        dueAt: result.data.dueAt ? new Date(result.data.dueAt) : undefined,
        reminderAt: result.data.reminderAt ? new Date(result.data.reminderAt) : undefined,
        recurrence: result.data.recurrence,
        source: result.data.source,
        externalRef: result.data.externalRef,
      });

      return reply.code(201).send({
        success: true,
        data: task,
      });
    }
  );

  // Get single task
  fastify.get(
    '/tasks/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const task = await taskService.getTaskById(id);

      if (!task) {
        return reply.code(404).send({
          success: false,
          error: 'Task not found',
        });
      }

      // Check ownership
      if (task.userId !== request.userId) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      return reply.send({
        success: true,
        data: task,
      });
    }
  );

  // Update task
  fastify.patch(
    '/tasks/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = UpdateTaskSchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid task data',
          details: result.error.format(),
        });
      }

      const existing = await taskService.getTaskById(id);

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: 'Task not found',
        });
      }

      if (existing.userId !== request.userId) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const task = await taskService.updateTask(id, {
        title: result.data.title,
        notes: result.data.notes,
        status: result.data.status,
        dueAt: result.data.dueAt ? new Date(result.data.dueAt) : result.data.dueAt,
        reminderAt: result.data.reminderAt
          ? new Date(result.data.reminderAt)
          : result.data.reminderAt,
        recurrence: result.data.recurrence,
      });

      // If status changed to DONE and from web, notify on WhatsApp
      if (result.data.status === 'DONE' && existing.status !== 'DONE') {
        try {
          const user = await userService.findUserById(request.userId!);
          if (user) {
            await whatsappService.sendWebDashboardNotification(user, task, 'done');
          }
        } catch (error) {
          logger.warn({ error, taskId: id }, 'Failed to send WhatsApp notification');
        }
      }

      return reply.send({
        success: true,
        data: task,
      });
    }
  );

  // Delete task
  fastify.delete(
    '/tasks/:id',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await taskService.getTaskById(id);

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: 'Task not found',
        });
      }

      if (existing.userId !== request.userId) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      await taskService.deleteTask(id);

      return reply.send({
        success: true,
        message: 'Task deleted',
      });
    }
  );

  // Complete task
  fastify.post(
    '/tasks/:id/complete',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await taskService.getTaskById(id);

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: 'Task not found',
        });
      }

      if (existing.userId !== request.userId) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const task = await taskService.markTaskDone(id);

      // Notify on WhatsApp
      try {
        const user = await userService.findUserById(request.userId!);
        if (user) {
          await whatsappService.sendWebDashboardNotification(user, task, 'done');
        }
      } catch (error) {
        logger.warn({ error, taskId: id }, 'Failed to send WhatsApp notification');
      }

      return reply.send({
        success: true,
        data: task,
      });
    }
  );

  // Snooze task
  fastify.post(
    '/tasks/:id/snooze',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = SnoozeRequestSchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid snooze request',
          details: result.error.format(),
        });
      }

      const existing = await taskService.getTaskById(id);

      if (!existing) {
        return reply.code(404).send({
          success: false,
          error: 'Task not found',
        });
      }

      if (existing.userId !== request.userId) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied',
        });
      }

      const { task, reminder } = await taskService.snoozeTask(id, result.data.minutes);

      return reply.send({
        success: true,
        data: {
          task,
          newReminderAt: reminder.scheduledAt,
        },
      });
    }
  );
}
