import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { config } from '../lib/config.js';
import { createChildLogger } from '../lib/logger.js';
// @ts-ignore - workspace package
import { handleInboundMessage, handleInteractiveReply } from '@whatsapp-productivity/mastra';
import * as userService from '../services/user.service.js';
import * as taskService from '../services/task.service.js';
import * as reminderService from '../services/reminder.service.js';
import * as whatsappService from '../services/whatsapp.service.js';
import type { WhatsAppWebhookPayload } from '@whatsapp-productivity/shared';

const logger = createChildLogger('whatsapp-routes');

// Create handler dependencies
const handlerDeps = {
  // User operations
  findUserByWhatsApp: userService.findUserByWhatsApp,
  getOrCreateUserByWhatsApp: userService.getOrCreateUserByWhatsApp,
  updateLastInbound: userService.updateLastInbound,
  updateUserName: userService.updateUserName,
  markUserOnboarded: userService.markUserOnboarded,

  // Task operations
  createTask: taskService.createTask,
  getTasksByUser: taskService.getTasksByUser,
  getTaskById: taskService.getTaskById,
  markTaskDone: taskService.markTaskDone,
  moveTask: taskService.moveTask,
  snoozeTask: taskService.snoozeTask,

  // Reminder operations
  getRecentSentReminder: reminderService.getRecentSentReminder,

  // WhatsApp operations
  sendTextMessage: whatsappService.sendTextMessage,
  sendReaction: whatsappService.sendReaction,
  sendTaskCreatedConfirmation: whatsappService.sendTaskCreatedConfirmation,
  sendTaskList: whatsappService.sendTaskList,
  sendHelpMessage: whatsappService.sendHelpMessage,
  sendSnoozeOptions: whatsappService.sendSnoozeOptions,
  logMessageEvent: whatsappService.logMessageEvent,
};

function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!config.whatsappAppSecret) {
    logger.warn('WhatsApp app secret not configured, skipping signature verification');
    return true;
  }

  const expectedSignature = crypto
    .createHmac('sha256', config.whatsappAppSecret)
    .update(payload)
    .digest('hex');

  const providedSignature = signature.replace('sha256=', '');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(providedSignature)
  );
}

export async function whatsappRoutes(fastify: FastifyInstance): Promise<void> {
  // Webhook verification (GET)
  fastify.get('/webhooks/whatsapp', async (request, reply) => {
    const query = request.query as Record<string, string>;

    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    logger.info({ mode, hasToken: !!token, hasChallenge: !!challenge }, 'Webhook verification request');

    if (mode === 'subscribe' && token === config.whatsappVerifyToken) {
      logger.info('Webhook verified successfully');
      return reply.send(challenge);
    }

    logger.warn('Webhook verification failed');
    return reply.code(403).send('Forbidden');
  });

  // Webhook handler (POST)
  // @ts-ignore - Fastify route options
  fastify.post('/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
      // Verify signature if app secret is configured
      const signature = request.headers['x-hub-signature-256'] as string;
      if (signature && config.whatsappAppSecret) {
        const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody || JSON.stringify(request.body);
        if (!verifyWebhookSignature(rawBody, signature)) {
          logger.warn('Invalid webhook signature');
          return reply.code(401).send('Invalid signature');
        }
      }

      const payload = request.body as WhatsAppWebhookPayload;

      // Always respond quickly to avoid timeout
      reply.send('EVENT_RECEIVED');

      // Process asynchronously
      processWebhook(payload).catch((error) => {
        logger.error({ error }, 'Error processing webhook');
      });
  });

  // Development endpoint to simulate inbound messages
  if (process.env.NODE_ENV === 'development') {
    fastify.post('/dev/simulate-message', async (request, reply) => {
      const { from, text, messageId } = request.body as { from: string; text: string; messageId?: string };

      if (!from || !text) {
        return reply.code(400).send({
          success: false,
          error: 'Missing "from" or "text" in body',
        });
      }

      logger.info({ from, text }, 'Simulating inbound message');

      const result = await handleInboundMessage(from, text, handlerDeps, messageId);

      return reply.send({
        success: true,
        result,
      });
    });

    // Simulate interactive reply
    fastify.post('/dev/simulate-reply', async (request, reply) => {
      const { from, replyId } = request.body as { from: string; replyId: string };

      if (!from || !replyId) {
        return reply.code(400).send({
          success: false,
          error: 'Missing "from" or "replyId" in body',
        });
      }

      logger.info({ from, replyId }, 'Simulating interactive reply');

      const result = await handleInteractiveReply(from, replyId, handlerDeps);

      return reply.send({
        success: true,
        result,
      });
    });
  }
}

async function processWebhook(payload: WhatsAppWebhookPayload): Promise<void> {
  if (payload.object !== 'whatsapp_business_account') {
    return;
  }

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') {
        continue;
      }

      const messages = change.value.messages || [];

      for (const message of messages) {
        const from = message.from;
        const messageId = message.id; // Capture message ID for reactions

        try {
          if (message.type === 'text' && message.text?.body) {
            // Handle text message - pass messageId for reactions
            await handleInboundMessage(from, message.text.body, handlerDeps, messageId);
          } else if (message.type === 'interactive') {
            // Handle interactive reply (button or list)
            const replyId =
              message.interactive?.button_reply?.id ||
              message.interactive?.list_reply?.id;

            if (replyId) {
              await handleInteractiveReply(from, replyId, handlerDeps);
            }
          } else if (message.type === 'button' && message.button?.payload) {
            // Handle template button reply
            await handleInteractiveReply(from, message.button.payload, handlerDeps);
          }
        } catch (error) {
          logger.error({ error, from, messageId }, 'Error processing message');
        }
      }

      // Handle status updates if needed
      const statuses = change.value.statuses || [];
      for (const status of statuses) {
        logger.debug(
          { messageId: status.id, status: status.status },
          'Message status update'
        );
      }
    }
  }
}
