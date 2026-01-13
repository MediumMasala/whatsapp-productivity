import { z } from 'zod';

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3001),
  host: z.string().default('0.0.0.0'),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  apiUrl: z.string().default('http://localhost:3001'),

  // Database
  databaseUrl: z.string(),

  // Redis
  redisUrl: z.string().default('redis://localhost:6379'),

  // WhatsApp
  whatsappPhoneNumberId: z.string(),
  whatsappAccessToken: z.string(),
  whatsappVerifyToken: z.string(),
  whatsappAppSecret: z.string().optional(),
  whatsappBusinessAccountId: z.string().optional(),

  // Auth
  jwtSecret: z.string().default('development-secret-change-in-production'),

  // AI
  openaiApiKey: z.string().optional(),
});

function loadConfig() {
  const result = configSchema.safeParse({
    port: process.env.API_PORT,
    host: process.env.API_HOST,
    nodeEnv: process.env.NODE_ENV,
    apiUrl: process.env.API_URL,
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    whatsappAppSecret: process.env.WHATSAPP_APP_SECRET,
    whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    jwtSecret: process.env.NEXTAUTH_SECRET,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });

  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    // In development, allow missing WhatsApp config
    if (process.env.NODE_ENV === 'development') {
      console.warn('Running in development mode with partial config');
      return {
        port: Number(process.env.API_PORT) || 3001,
        host: process.env.API_HOST || '0.0.0.0',
        nodeEnv: 'development' as const,
        apiUrl: process.env.API_URL || 'http://localhost:3001',
        databaseUrl: process.env.DATABASE_URL || '',
        redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
        whatsappPhoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || 'mock_phone_id',
        whatsappAccessToken: process.env.WHATSAPP_ACCESS_TOKEN || 'mock_token',
        whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'test_verify_token',
        whatsappAppSecret: process.env.WHATSAPP_APP_SECRET,
        whatsappBusinessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
        jwtSecret: process.env.NEXTAUTH_SECRET || 'development-secret',
        openaiApiKey: process.env.OPENAI_API_KEY,
      };
    }
    throw new Error('Invalid configuration');
  }

  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
