import type { FastifyInstance } from 'fastify';
import { UpdateUserSchema } from '@whatsapp-productivity/shared';
import * as userService from '../services/user.service.js';
import { authMiddleware } from '../middleware/auth.js';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  // Update user settings
  fastify.patch(
    '/users/me',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const result = UpdateUserSchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid user data',
          details: result.error.format(),
        });
      }

      const user = await userService.updateUser(request.userId!, result.data);

      return reply.send({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          whatsappNumber: user.whatsappNumber,
          timezone: user.timezone,
          quietHoursStart: user.quietHoursStart,
          quietHoursEnd: user.quietHoursEnd,
          snoozeMinutesDefault: user.snoozeMinutesDefault,
          reminderLeadTime: user.reminderLeadTime,
        },
      });
    }
  );
}
