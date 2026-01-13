// Default timezone
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

// Default reminder time (10:00 AM)
export const DEFAULT_REMINDER_HOUR = 10;
export const DEFAULT_REMINDER_MINUTE = 0;

// Session window for WhatsApp (24 hours in milliseconds)
export const WHATSAPP_SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

// Default snooze minutes
export const DEFAULT_SNOOZE_MINUTES = 15;

// Snooze options (in minutes)
export const SNOOZE_OPTIONS = [
  { minutes: 15, label: '15 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 180, label: '3 hours' },
  { minutes: 1440, label: 'Tomorrow 10am' },
] as const;

// Task statuses with labels
export const TASK_STATUS_CONFIG = {
  IDEA: {
    label: 'Ideas',
    emoji: '💡',
    color: 'purple',
  },
  TODO: {
    label: 'To-Do',
    emoji: '📋',
    color: 'blue',
  },
  DONE: {
    label: 'Done',
    emoji: '✅',
    color: 'green',
  },
} as const;

// WhatsApp template name for reminders outside 24h window
export const WHATSAPP_REMINDER_TEMPLATE_NAME = 'task_reminder_v1';

// Maximum retry count for reminders
export const MAX_REMINDER_RETRIES = 3;

// Sweeper cron interval (in milliseconds)
export const SWEEPER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// OTP expiry (in seconds)
export const OTP_EXPIRY_SECONDS = 600; // 10 minutes

// OTP length
export const OTP_LENGTH = 6;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Quick reply button IDs
export const QUICK_REPLY_IDS = {
  DONE: 'action_done',
  SNOOZE: 'action_snooze',
  EDIT: 'action_edit',
  SNOOZE_15: 'snooze_15',
  SNOOZE_60: 'snooze_60',
  SNOOZE_180: 'snooze_180',
  SNOOZE_TOMORROW: 'snooze_tomorrow',
} as const;

// AI confidence threshold
export const AI_CONFIDENCE_THRESHOLD = 0.6;

// Rate limiting
export const RATE_LIMITS = {
  WEBHOOK: {
    points: 100,
    duration: 60, // per minute
  },
  AUTH: {
    points: 5,
    duration: 60, // per minute
  },
  API: {
    points: 60,
    duration: 60, // per minute
  },
} as const;
