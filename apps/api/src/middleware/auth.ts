import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { createChildLogger } from '../lib/logger.js';

const logger = createChildLogger('auth-middleware');

// @ts-ignore - Fastify type augmentation
declare module 'fastify' {
  // @ts-ignore
  interface FastifyRequest {
    userId?: string;
    // @ts-ignore
    user?: {
      id: string;
      email?: string;
      whatsappNumber: string;
    };
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    reply.code(401).send({ success: false, error: 'No authorization header' });
    return;
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    reply.code(401).send({ success: false, error: 'Invalid authorization format' });
    return;
  }

  try {
    const decoded = await request.server.jwt.verify<{
      userId: string;
      email?: string;
      whatsappNumber: string;
    }>(token);

    request.userId = decoded.userId;
    request.user = {
      id: decoded.userId,
      email: decoded.email,
      whatsappNumber: decoded.whatsappNumber,
    };
  } catch (error) {
    logger.warn({ error }, 'JWT verification failed');
    reply.code(401).send({ success: false, error: 'Invalid token' });
  }
}

export async function optionalAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return;
  }

  const [type, token] = authHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    return;
  }

  try {
    const decoded = await request.server.jwt.verify<{
      userId: string;
      email?: string;
      whatsappNumber: string;
    }>(token);

    request.userId = decoded.userId;
    request.user = {
      id: decoded.userId,
      email: decoded.email,
      whatsappNumber: decoded.whatsappNumber,
    };
  } catch {
    // Silently ignore - optional auth
  }
}

export function registerJwt(fastify: FastifyInstance, secret: string): void {
  fastify.register(import('@fastify/jwt'), {
    secret,
  });
}
