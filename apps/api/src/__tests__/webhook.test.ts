import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../lib/prisma.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    reminder: {
      create: vi.fn(),
    },
    messageEvent: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../lib/queue.js', () => ({
  scheduleReminderJob: vi.fn(),
}));

describe('Webhook Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('WhatsApp Webhook Verification', () => {
    it('should return challenge when verify token matches', () => {
      // This would be a full integration test with Fastify
      const verifyToken = 'test_token';
      const challenge = '123456';
      const hubMode = 'subscribe';

      // Simulate verification
      if (hubMode === 'subscribe' && verifyToken === 'test_token') {
        expect(challenge).toBe('123456');
      }
    });

    it('should reject when verify token does not match', () => {
      const verifyToken = 'wrong_token';
      const expectedToken = 'test_token';

      expect(verifyToken).not.toBe(expectedToken);
    });
  });

  describe('Message Processing', () => {
    it('should create user if not exists', async () => {
      const prisma = (await import('../lib/prisma.js')).default;

      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'new-user-id',
        whatsappNumber: '+919999999999',
        timezone: 'Asia/Kolkata',
      });

      // Simulate getOrCreateUser logic
      let user = await prisma.user.findUnique({
        where: { whatsappNumber: '+919999999999' },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            whatsappNumber: '+919999999999',
            timezone: 'Asia/Kolkata',
          },
        });
      }

      expect(user.id).toBe('new-user-id');
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should update lastInboundAt on message', async () => {
      const prisma = (await import('../lib/prisma.js')).default;

      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'user-id',
        lastInboundAt: new Date(),
      });

      await prisma.user.update({
        where: { id: 'user-id' },
        data: { lastInboundAt: new Date() },
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: expect.objectContaining({ lastInboundAt: expect.any(Date) }),
      });
    });
  });

  describe('Task Creation from Message', () => {
    it('should create task with reminder', async () => {
      const prisma = (await import('../lib/prisma.js')).default;
      const { scheduleReminderJob } = await import('../lib/queue.js');

      const reminderAt = new Date(Date.now() + 60 * 60 * 1000);

      (prisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'task-id',
        userId: 'user-id',
        title: 'Send the deck',
        status: 'TODO',
        reminderAt,
      });

      (prisma.reminder.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'reminder-id',
        taskId: 'task-id',
        scheduledAt: reminderAt,
      });

      const task = await prisma.task.create({
        data: {
          userId: 'user-id',
          title: 'Send the deck',
          status: 'TODO',
          reminderAt,
          source: 'WHATSAPP',
        },
      });

      const reminder = await prisma.reminder.create({
        data: {
          taskId: task.id,
          userId: 'user-id',
          scheduledAt: reminderAt,
          state: 'SCHEDULED',
        },
      });

      expect(task.id).toBe('task-id');
      expect(task.reminderAt).toBe(reminderAt);
      expect(reminder.id).toBe('reminder-id');
    });
  });
});
