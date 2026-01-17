import { z } from 'zod';

// Task status enum schema
export const TaskStatusSchema = z.enum(['IDEA', 'TODO', 'DONE']);

// Task source enum schema
export const TaskSourceSchema = z.enum(['WHATSAPP', 'WEB']);

// Reminder delivery mode schema
export const ReminderDeliveryModeSchema = z.enum(['SESSION_FREEFORM', 'TEMPLATE']);

// Reminder state schema
export const ReminderStateSchema = z.enum([
  'SCHEDULED',
  'SENT',
  'ACKED_DONE',
  'ACKED_SNOOZE',
  'FAILED',
  'CANCELED',
]);

// E.164 phone number validation
export const E164PhoneSchema = z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid E.164 phone number');

// User creation schema
export const CreateUserSchema = z.object({
  email: z.string().email().optional(),
  whatsappNumber: E164PhoneSchema,
  timezone: z.string().default('Asia/Kolkata'),
});

// User update schema
export const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  timezone: z.string().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  snoozeMinutesDefault: z.number().int().min(1).max(1440).optional(),
  reminderLeadTime: z.number().int().min(0).max(1440).optional(),
});

// Task creation schema
export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(5000).optional(),
  status: TaskStatusSchema.default('TODO'),
  dueAt: z.string().datetime().optional(),
  reminderAt: z.string().datetime().optional(),
  recurrence: z.string().max(200).optional(),
  source: TaskSourceSchema.default('WEB'),
  externalRef: z.string().max(200).optional(),
});

// Task update schema
export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(5000).nullable().optional(),
  status: TaskStatusSchema.optional(),
  dueAt: z.string().datetime().nullable().optional(),
  reminderAt: z.string().datetime().nullable().optional(),
  recurrence: z.string().max(200).nullable().optional(),
});

// Task query schema
export const TaskQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Snooze request schema
export const SnoozeRequestSchema = z.object({
  minutes: z.number().int().min(1).max(10080), // Max 1 week
});

// AI parsed result schema
export const AIParsedResultSchema = z.object({
  intent: z.enum([
    'create_task',
    'list_tasks',
    'mark_done',
    'snooze',
    'edit_task',
    'move_task',
    'set_pref',
    'help',
    'unknown',
  ]),
  task: z
    .object({
      title: z.string(),
      notes: z.string().optional(),
      status: z.enum(['IDEA', 'TODO']).optional(),
      dueAt: z.string().optional(),
      reminderAt: z.string().optional(),
    })
    .optional(),
  taskId: z.string().optional(),
  snoozeMinutes: z.number().optional(),
  pref: z
    .object({
      timezone: z.string().optional(),
      quietHoursStart: z.string().optional(),
      quietHoursEnd: z.string().optional(),
      snoozeMinutesDefault: z.number().optional(),
    })
    .optional(),
  confidence: z.number().min(0).max(1),
});

// WhatsApp webhook verification schema
export const WhatsAppVerifySchema = z.object({
  'hub.mode': z.literal('subscribe'),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

// WhatsApp inbound message schema (simplified)
export const WhatsAppInboundMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(['text', 'interactive', 'button']),
  text: z
    .object({
      body: z.string(),
    })
    .optional(),
  interactive: z
    .object({
      type: z.enum(['button_reply', 'list_reply']),
      button_reply: z
        .object({
          id: z.string(),
          title: z.string(),
        })
        .optional(),
      list_reply: z
        .object({
          id: z.string(),
          title: z.string(),
          description: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  button: z
    .object({
      payload: z.string(),
      text: z.string(),
    })
    .optional(),
});

// Auth schemas - WhatsApp-based OTP login
export const RequestOtpSchema = z.object({
  whatsappNumber: z.string().min(10).max(15), // Will be normalized to E.164
});

export const VerifyOtpSchema = z.object({
  whatsappNumber: z.string().min(10).max(15),
  otp: z.string().length(6),
});

// Deprecated - kept for backward compatibility
export const LinkWhatsAppSchema = z.object({
  whatsappNumber: E164PhoneSchema,
});

// Export types inferred from schemas
export type CreateUser = z.infer<typeof CreateUserSchema>;
export type UpdateUser = z.infer<typeof UpdateUserSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type TaskQuery = z.infer<typeof TaskQuerySchema>;
export type SnoozeRequest = z.infer<typeof SnoozeRequestSchema>;
export type AIParsedResultInput = z.infer<typeof AIParsedResultSchema>;
export type RequestOtp = z.infer<typeof RequestOtpSchema>;
export type VerifyOtp = z.infer<typeof VerifyOtpSchema>;
export type LinkWhatsApp = z.infer<typeof LinkWhatsAppSchema>;
