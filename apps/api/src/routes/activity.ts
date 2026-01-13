import type { FastifyInstance } from 'fastify';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../middleware/auth.js';

export async function activityRoutes(fastify: FastifyInstance): Promise<void> {
  // Get activity log
  fastify.get(
    '/activity',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const query = request.query as {
        page?: string;
        pageSize?: string;
      };

      const page = parseInt(query.page || '1');
      const pageSize = Math.min(parseInt(query.pageSize || '50'), 100);

      const [events, total] = await Promise.all([
        prisma.messageEvent.findMany({
          where: { userId: request.userId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.messageEvent.count({
          where: { userId: request.userId },
        }),
      ]);

      return reply.send({
        success: true,
        data: {
          items: events,
          total,
          page,
          pageSize,
          hasMore: total > page * pageSize,
        },
      });
    }
  );
}
