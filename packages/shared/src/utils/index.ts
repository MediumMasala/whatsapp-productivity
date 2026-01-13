import * as chrono from 'chrono-node';
import {
  format,
  addDays,
  setHours,
  setMinutes,
  isAfter,
  parseISO,
  differenceInMilliseconds,
} from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import {
  DEFAULT_TIMEZONE,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  WHATSAPP_SESSION_WINDOW_MS,
} from '../constants/index.js';

/**
 * Parse natural language date/time using chrono-node
 */
export function parseDateTime(
  text: string,
  timezone: string = DEFAULT_TIMEZONE,
  referenceDate?: Date
): Date | null {
  const ref = referenceDate || new Date();
  const zonedRef = toZonedTime(ref, timezone);

  // Use chrono to parse
  const results = chrono.parse(text, zonedRef, { forwardDate: true });

  if (results.length === 0) {
    return null;
  }

  const parsed = results[0];
  let date = parsed.date();

  // If no time was specified, use default reminder time
  if (!parsed.start.isCertain('hour')) {
    date = setHours(setMinutes(date, DEFAULT_REMINDER_MINUTE), DEFAULT_REMINDER_HOUR);
  }

  // Convert back to UTC
  return fromZonedTime(date, timezone);
}

/**
 * Apply default time rules based on specification
 */
export function applyDefaultTimeRules(
  parsedDate: Date | null,
  text: string,
  timezone: string = DEFAULT_TIMEZONE
): Date | null {
  const now = new Date();
  const zonedNow = toZonedTime(now, timezone);
  const currentHour = zonedNow.getHours();

  // If "tomorrow" mentioned and no time, default to 10 AM
  if (text.toLowerCase().includes('tomorrow') && parsedDate) {
    const zonedParsed = toZonedTime(parsedDate, timezone);
    if (zonedParsed.getHours() === 12 && zonedParsed.getMinutes() === 0) {
      // chrono defaults to noon, override to 10 AM
      const adjusted = setHours(setMinutes(zonedParsed, DEFAULT_REMINDER_MINUTE), DEFAULT_REMINDER_HOUR);
      return fromZonedTime(adjusted, timezone);
    }
  }

  // If "today" mentioned and it's past 6 PM, move to next day 10 AM
  if (text.toLowerCase().includes('today') && currentHour >= 18 && parsedDate) {
    const zonedParsed = toZonedTime(parsedDate, timezone);
    const nextDay = addDays(zonedParsed, 1);
    const adjusted = setHours(setMinutes(nextDay, DEFAULT_REMINDER_MINUTE), DEFAULT_REMINDER_HOUR);
    return fromZonedTime(adjusted, timezone);
  }

  return parsedDate;
}

/**
 * Format a date for display in a specific timezone
 */
export function formatDateForDisplay(
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE,
  formatStr: string = "MMM d 'at' h:mm a"
): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatInTimeZone(d, timezone, formatStr);
}

/**
 * Format relative time for display
 */
export function formatRelativeTime(
  date: Date | string,
  timezone: string = DEFAULT_TIMEZONE
): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  const now = new Date();
  const zonedDate = toZonedTime(d, timezone);
  const zonedNow = toZonedTime(now, timezone);

  const today = format(zonedNow, 'yyyy-MM-dd');
  const tomorrow = format(addDays(zonedNow, 1), 'yyyy-MM-dd');
  const dateStr = format(zonedDate, 'yyyy-MM-dd');
  const timeStr = format(zonedDate, 'h:mm a');

  if (dateStr === today) {
    return `today ${timeStr}`;
  } else if (dateStr === tomorrow) {
    return `tomorrow ${timeStr}`;
  } else {
    return formatInTimeZone(d, timezone, "MMM d 'at' h:mm a");
  }
}

/**
 * Check if user is within WhatsApp 24h session window
 */
export function isWithinSessionWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) {
    return false;
  }
  const diff = differenceInMilliseconds(new Date(), lastInboundAt);
  return diff <= WHATSAPP_SESSION_WINDOW_MS;
}

/**
 * Generate a random OTP
 */
export function generateOtp(length: number = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
}

/**
 * Normalize WhatsApp phone number to E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // Ensure it starts with +
  if (!normalized.startsWith('+')) {
    // Assume Indian number if no country code
    if (normalized.length === 10) {
      normalized = '+91' + normalized;
    } else {
      normalized = '+' + normalized;
    }
  }

  return normalized;
}

/**
 * Extract task title from message, removing time/date expressions
 */
export function extractTaskTitle(text: string): string {
  // Remove common prefixes
  let title = text
    .replace(/^(remind me( to)?|todo:|idea:|task:)\s*/i, '')
    .trim();

  // Remove time expressions at the end
  const timePatterns = [
    /\s+(at|@)\s+\d{1,2}(:\d{2})?\s*(am|pm)?$/i,
    /\s+tomorrow\s*(morning|afternoon|evening)?$/i,
    /\s+today\s*(morning|afternoon|evening)?$/i,
    /\s+on\s+\w+day$/i,
    /\s+in\s+\d+\s*(minutes?|hours?|days?)$/i,
    /\s+next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
  ];

  for (const pattern of timePatterns) {
    title = title.replace(pattern, '');
  }

  return title.trim();
}

/**
 * Detect intent from message text (rule-based fallback)
 */
export function detectIntentRuleBased(text: string): {
  intent: string;
  status?: 'IDEA' | 'TODO';
} {
  const lower = text.toLowerCase().trim();

  // Commands
  if (lower === 'list' || lower === 'tasks' || lower === 'show tasks') {
    return { intent: 'list_tasks' };
  }
  if (lower === 'ideas' || lower === 'show ideas') {
    return { intent: 'list_tasks', status: 'IDEA' };
  }
  if (lower === 'help' || lower === '?') {
    return { intent: 'help' };
  }
  if (lower === 'settings') {
    return { intent: 'set_pref' };
  }

  // Done markers
  if (lower.startsWith('done:') || lower.startsWith('done ') || lower === 'done') {
    return { intent: 'mark_done' };
  }

  // Snooze
  if (lower.startsWith('snooze')) {
    return { intent: 'snooze' };
  }

  // Ideas
  if (lower.startsWith('idea:') || lower.includes('brainstorm')) {
    return { intent: 'create_task', status: 'IDEA' };
  }

  // Todo explicit
  if (lower.startsWith('todo:')) {
    return { intent: 'create_task', status: 'TODO' };
  }

  // Reminder request
  if (lower.includes('remind me') || lower.includes('reminder')) {
    return { intent: 'create_task', status: 'TODO' };
  }

  // Move commands
  if (lower.includes('move') && (lower.includes('to idea') || lower.includes('to todo') || lower.includes('to done'))) {
    return { intent: 'move_task' };
  }

  // Default to create task
  return { intent: 'create_task', status: 'TODO' };
}

/**
 * Sanitize object for logging (remove sensitive fields)
 */
export function sanitizeForLogging(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['token', 'access_token', 'password', 'secret', 'authorization'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Create a delay promise
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}
