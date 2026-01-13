import prisma from '../lib/prisma.js';
import { createChildLogger } from '../lib/logger.js';
import { generateOtp, normalizePhoneNumber } from '@whatsapp-productivity/shared';
import { OTP_EXPIRY_SECONDS } from '@whatsapp-productivity/shared';
import type { User } from '@prisma/client';

const logger = createChildLogger('user-service');

export async function findUserByWhatsApp(whatsappNumber: string): Promise<User | null> {
  const normalized = normalizePhoneNumber(whatsappNumber);
  return prisma.user.findUnique({
    where: { whatsappNumber: normalized },
  });
}

export async function findUserByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { email },
  });
}

export async function findUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({
    where: { id },
  });
}

export async function createUser(data: {
  whatsappNumber: string;
  email?: string;
  timezone?: string;
}): Promise<User> {
  const normalized = normalizePhoneNumber(data.whatsappNumber);

  const user = await prisma.user.create({
    data: {
      whatsappNumber: normalized,
      email: data.email,
      timezone: data.timezone || 'Asia/Kolkata',
    },
  });

  logger.info({ userId: user.id, whatsappNumber: normalized }, 'Created new user');
  return user;
}

export async function getOrCreateUserByWhatsApp(whatsappNumber: string): Promise<User> {
  const normalized = normalizePhoneNumber(whatsappNumber);

  let user = await prisma.user.findUnique({
    where: { whatsappNumber: normalized },
  });

  if (!user) {
    user = await createUser({ whatsappNumber: normalized });
  }

  return user;
}

export async function updateUser(
  id: string,
  data: Partial<{
    email: string;
    timezone: string;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    snoozeMinutesDefault: number;
    reminderLeadTime: number;
  }>
): Promise<User> {
  return prisma.user.update({
    where: { id },
    data,
  });
}

export async function updateLastInbound(id: string): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: { lastInboundAt: new Date() },
  });
}

export async function generateAndStoreOtp(email: string): Promise<{ otp: string; user: User }> {
  const otp = generateOtp(6);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_SECONDS * 1000);

  // Find or create user by email
  let user = await findUserByEmail(email);

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpiresAt: expiresAt,
      },
    });
  } else {
    // Create a temporary user - they'll need to link WhatsApp later
    user = await prisma.user.create({
      data: {
        email,
        whatsappNumber: `temp_${Date.now()}`, // Temporary, will be updated when linking
        otpCode: otp,
        otpExpiresAt: expiresAt,
      },
    });
  }

  logger.info({ email }, 'Generated OTP for user');
  return { otp, user };
}

export async function verifyOtp(
  email: string,
  otp: string
): Promise<{ valid: boolean; user?: User }> {
  const user = await findUserByEmail(email);

  if (!user) {
    return { valid: false };
  }

  if (!user.otpCode || !user.otpExpiresAt) {
    return { valid: false };
  }

  if (user.otpCode !== otp) {
    return { valid: false };
  }

  if (new Date() > user.otpExpiresAt) {
    return { valid: false };
  }

  // Clear OTP after successful verification
  await prisma.user.update({
    where: { id: user.id },
    data: {
      otpCode: null,
      otpExpiresAt: null,
    },
  });

  logger.info({ userId: user.id }, 'OTP verified successfully');
  return { valid: true, user };
}

export async function linkWhatsAppNumber(
  userId: string,
  whatsappNumber: string
): Promise<User> {
  const normalized = normalizePhoneNumber(whatsappNumber);

  // Check if this WhatsApp number is already linked to another user
  const existing = await findUserByWhatsApp(normalized);
  if (existing && existing.id !== userId) {
    throw new Error('WhatsApp number already linked to another account');
  }

  return prisma.user.update({
    where: { id: userId },
    data: { whatsappNumber: normalized },
  });
}
