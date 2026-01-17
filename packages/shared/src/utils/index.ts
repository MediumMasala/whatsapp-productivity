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
 *
 * Rules:
 * - If user specifies exact time (e.g., "7:45pm"), use EXACTLY that time
 * - If no date specified, assume TODAY
 * - If "tomorrow" specified, use tomorrow
 * - Only move to next day if the specified time has already passed today
 */
export function parseDateTime(
  text: string,
  timezone: string = DEFAULT_TIMEZONE,
  referenceDate?: Date
): Date | null {
  const ref = referenceDate || new Date();
  const zonedRef = toZonedTime(ref, timezone);
  const currentHour = zonedRef.getHours();
  const lower = text.toLowerCase();

  // Use chrono to parse - forwardDate: true means prefer future dates
  const results = chrono.parse(text, zonedRef, { forwardDate: true });

  if (results.length === 0) {
    return null;
  }

  const parsed = results[0];
  let date = parsed.date();

  // Check if user explicitly mentioned "tomorrow"
  const hasTomorrow = lower.includes('tomorrow');
  // Check if user explicitly mentioned "today"
  const hasToday = lower.includes('today');

  // If user specified an exact time (hour is certain), respect it exactly
  if (parsed.start.isCertain('hour')) {
    // User gave exact time like "7:45pm" - use it as-is
    // chrono should have parsed it correctly

    // Handle AM/PM ambiguity only if meridiem is not certain
    if (!parsed.start.isCertain('meridiem')) {
      const parsedHour = parsed.start.get('hour') || 0;
      // If hour is 1-11 and no AM/PM specified, infer based on context
      if (parsedHour >= 1 && parsedHour <= 11) {
        // If it's currently afternoon/evening and the hour would be in the past as AM, assume PM
        if (currentHour >= 12 && parsedHour < currentHour - 12) {
          date = setHours(date, parsedHour + 12);
        } else if (currentHour >= 17 && parsedHour < 12) {
          // Evening: assume PM for reasonable hours
          date = setHours(date, parsedHour + 12);
        }
      }
    }
  } else {
    // No specific time given - this shouldn't happen if user said "at 7:45pm"
    // but if it does, don't set a default time, return null to indicate no time parsed
    return null;
  }

  // Handle date logic:
  // - If "tomorrow" is explicitly mentioned, chrono handles it
  // - If "today" is explicitly mentioned, keep it today even if time passed
  // - If neither, and time is in past, move to tomorrow
  const zonedDate = toZonedTime(date, timezone);

  if (!hasTomorrow && !hasToday) {
    // No explicit day mentioned - if time is in the past, move to tomorrow
    if (isAfter(zonedRef, zonedDate)) {
      date = addDays(date, 1);
    }
  } else if (hasToday) {
    // User explicitly said "today" - keep it today even if past
    // (they might want to note it was supposed to be today)
    // Actually, if time is past, still move to that time today (for record)
    // But realistically, if it's past, we should still set it for today
    // The reminder just won't fire if already past
  }
  // If "tomorrow" was mentioned, chrono already set it to tomorrow

  // Convert back to UTC
  return fromZonedTime(date, timezone);
}

/**
 * Apply default time rules based on specification
 *
 * IMPORTANT: This function should NEVER override a user-specified time.
 * It only applies defaults when NO time was specified.
 */
export function applyDefaultTimeRules(
  parsedDate: Date | null,
  text: string,
  timezone: string = DEFAULT_TIMEZONE
): Date | null {
  // If no date was parsed, nothing to adjust
  if (!parsedDate) {
    return null;
  }

  // User specified a time - return it as-is, don't override
  // The parseDateTime function already handles all the logic
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

  // Remove time expressions (at end, middle, or anywhere)
  const timePatterns = [
    /\s+(at|@|by)\s+\d{1,2}(:\d{2})?\s*(am|pm)?/gi,
    /\s+tomorrow\s*(morning|afternoon|evening|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?)?/gi,
    /\s+today\s*(morning|afternoon|evening|at\s+\d{1,2}(:\d{2})?\s*(am|pm)?)?/gi,
    /\s+on\s+\w+day/gi,
    /\s+in\s+\d+\s*(minutes?|hours?|days?)/gi,
    /\s+next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi,
    /\s+this\s+(morning|afternoon|evening|night)/gi,
    /\s+tonight/gi,
  ];

  for (const pattern of timePatterns) {
    title = title.replace(pattern, '');
  }

  // Clean up any double spaces
  title = title.replace(/\s+/g, ' ').trim();

  return title;
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
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
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
