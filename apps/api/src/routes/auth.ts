import type { FastifyInstance } from 'fastify';
import {
  RequestOtpSchema,
  VerifyOtpSchema,
  LinkWhatsAppSchema,
  normalizePhoneNumber,
} from '@whatsapp-productivity/shared';
import * as userService from '../services/user.service.js';
import * as whatsappService from '../services/whatsapp.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { createChildLogger } from '../lib/logger.js';

const logger = createChildLogger('auth-routes');

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Request OTP via WhatsApp
  fastify.post('/auth/request-otp', async (request, reply) => {
    const result = RequestOtpSchema.safeParse(request.body);

    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid request',
        details: result.error.format(),
      });
    }

    const { whatsappNumber } = result.data;
    const normalized = normalizePhoneNumber(whatsappNumber);

    try {
      const { otp, user } = await userService.generateAndStoreOtp(whatsappNumber);

      // Send OTP via WhatsApp
      const sendResult = await whatsappService.sendOtpMessage(normalized, otp);

      if (!sendResult.success) {
        logger.error({ error: sendResult.error, whatsappNumber: normalized }, 'Failed to send OTP via WhatsApp');

        // In development, still return success with OTP for testing
        if (process.env.NODE_ENV === 'development') {
          return reply.send({
            success: true,
            message: 'OTP generated (WhatsApp send failed in dev mode)',
            devOtp: otp,
          });
        }

        return reply.code(500).send({
          success: false,
          error: 'Failed to send OTP via WhatsApp',
        });
      }

      logger.info({ whatsappNumber: normalized }, 'OTP sent via WhatsApp');

      return reply.send({
        success: true,
        message: 'OTP sent to your WhatsApp',
        // Only include this in development
        ...(process.env.NODE_ENV === 'development' && { devOtp: otp }),
      });
    } catch (error) {
      logger.error({ error, whatsappNumber: normalized }, 'Failed to generate OTP');
      return reply.code(500).send({
        success: false,
        error: 'Failed to send OTP',
      });
    }
  });

  // Verify OTP
  fastify.post('/auth/verify-otp', async (request, reply) => {
    const result = VerifyOtpSchema.safeParse(request.body);

    if (!result.success) {
      return reply.code(400).send({
        success: false,
        error: 'Invalid request',
        details: result.error.format(),
      });
    }

    const { whatsappNumber, otp } = result.data;

    try {
      const { valid, user } = await userService.verifyOtp(whatsappNumber, otp);

      if (!valid || !user) {
        return reply.code(401).send({
          success: false,
          error: 'Invalid or expired OTP',
        });
      }

      // Generate JWT
      const token = fastify.jwt.sign({
        userId: user.id,
        email: user.email,
        whatsappNumber: user.whatsappNumber,
      });

      return reply.send({
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
          whatsappNumber: user.whatsappNumber,
          timezone: user.timezone,
          name: user.name,
        },
      });
    } catch (error) {
      logger.error({ error, whatsappNumber }, 'Failed to verify OTP');
      return reply.code(500).send({
        success: false,
        error: 'Verification failed',
      });
    }
  });

  // Get current user
  fastify.get(
    '/me',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const user = await userService.findUserById(request.userId!);

      if (!user) {
        return reply.code(404).send({
          success: false,
          error: 'User not found',
        });
      }

      return reply.send({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          whatsappNumber: user.whatsappNumber,
          timezone: user.timezone,
          quietHoursStart: user.quietHoursStart,
          quietHoursEnd: user.quietHoursEnd,
          snoozeMinutesDefault: user.snoozeMinutesDefault,
          reminderLeadTime: user.reminderLeadTime,
          needsWhatsAppLink: user.whatsappNumber.startsWith('temp_'),
        },
      });
    }
  );

  // Link WhatsApp number
  fastify.post(
    '/auth/link-whatsapp',
    { preHandler: authMiddleware },
    async (request, reply) => {
      const result = LinkWhatsAppSchema.safeParse(request.body);

      if (!result.success) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid request',
          details: result.error.format(),
        });
      }

      try {
        const user = await userService.linkWhatsAppNumber(
          request.userId!,
          result.data.whatsappNumber
        );

        // Generate new token with updated WhatsApp number
        const token = fastify.jwt.sign({
          userId: user.id,
          email: user.email,
          whatsappNumber: user.whatsappNumber,
        });

        return reply.send({
          success: true,
          token,
          user: {
            id: user.id,
            email: user.email,
            whatsappNumber: user.whatsappNumber,
            timezone: user.timezone,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to link WhatsApp number');
        return reply.code(400).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to link WhatsApp number',
        });
      }
    }
  );
}
