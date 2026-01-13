import * as chrono from 'chrono-node';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { setHours, setMinutes, addDays } from 'date-fns';
import {
  parseDateTime,
  applyDefaultTimeRules,
  extractTaskTitle,
  detectIntentRuleBased,
  DEFAULT_TIMEZONE,
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  AI_CONFIDENCE_THRESHOLD,
} from '@whatsapp-productivity/shared';
import type { AIParsedResult } from '@whatsapp-productivity/shared';
import OpenAI from 'openai';

// Initialize OpenAI client (will fail gracefully if no key)
let openai: OpenAI | null = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch {
  console.warn('OpenAI client not initialized');
}

const SYSTEM_PROMPT = `You are a task parsing assistant. Parse user messages to extract task information.

Output a JSON object with:
{
  "intent": "create_task" | "list_tasks" | "mark_done" | "snooze" | "edit_task" | "move_task" | "set_pref" | "help" | "unknown",
  "task": {
    "title": "extracted task title without time expressions",
    "notes": "any additional details (optional)",
    "status": "IDEA" or "TODO",
    "dueAt": "ISO datetime if mentioned",
    "reminderAt": "ISO datetime for reminder"
  },
  "taskId": "if referring to existing task",
  "snoozeMinutes": number if snoozing,
  "pref": { "timezone": "...", etc } if setting preferences,
  "confidence": 0.0 to 1.0
}

Rules:
- "idea:" prefix or brainstorming language -> status: "IDEA", no reminder
- "todo:" prefix -> status: "TODO"
- "remind me" or "reminder" -> status: "TODO" with reminderAt
- "done" or "done:" -> intent: "mark_done"
- "snooze" -> intent: "snooze"
- "list" or "tasks" -> intent: "list_tasks"
- "ideas" -> intent: "list_tasks" (for ideas)
- "move X to done/todo/ideas" -> intent: "move_task"
- "settings" or "help" -> appropriate intent

Current user timezone: {{TIMEZONE}}
Current datetime: {{DATETIME}}`;

export interface ParseContext {
  timezone: string;
  currentTime?: Date;
  recentTaskId?: string; // For "done" or "snooze" without specifying task
}

export async function parseMessage(
  text: string,
  context: ParseContext
): Promise<AIParsedResult> {
  const { timezone = DEFAULT_TIMEZONE, currentTime = new Date() } = context;

  // Try rule-based parsing first
  const ruleBased = parseWithRules(text, timezone, currentTime);

  // If high confidence or no AI available, return rule-based result
  if (ruleBased.confidence >= AI_CONFIDENCE_THRESHOLD || !openai) {
    return ruleBased;
  }

  // Try AI parsing for ambiguous cases
  try {
    const aiResult = await parseWithAI(text, timezone, currentTime);
    if (aiResult && aiResult.confidence > ruleBased.confidence) {
      return aiResult;
    }
  } catch (error) {
    console.error('AI parsing failed, using rule-based:', error);
  }

  return ruleBased;
}

function parseWithRules(
  text: string,
  timezone: string,
  currentTime: Date
): AIParsedResult {
  const lower = text.toLowerCase().trim();

  // Detect intent
  const { intent, status: detectedStatus } = detectIntentRuleBased(text);

  // Handle simple commands
  if (intent === 'list_tasks') {
    return {
      intent: 'list_tasks',
      task: detectedStatus ? { title: '', status: detectedStatus } : undefined,
      confidence: 0.95,
    };
  }

  if (intent === 'help') {
    return { intent: 'help', confidence: 0.95 };
  }

  if (intent === 'set_pref' && lower === 'settings') {
    return { intent: 'set_pref', confidence: 0.95 };
  }

  if (intent === 'mark_done') {
    // Extract task reference if any
    const doneMatch = lower.match(/done:?\s*(.+)?/);
    return {
      intent: 'mark_done',
      taskId: doneMatch?.[1]?.trim() || undefined,
      confidence: 0.9,
    };
  }

  if (intent === 'snooze') {
    // Parse snooze duration
    const snoozeMatch = lower.match(/snooze\s*(\d+)?\s*(min|minute|h|hour|hr)?s?/i);
    let minutes = 15; // default

    if (snoozeMatch?.[1]) {
      const num = parseInt(snoozeMatch[1]);
      const unit = snoozeMatch[2]?.toLowerCase();
      if (unit?.startsWith('h')) {
        minutes = num * 60;
      } else {
        minutes = num;
      }
    }

    return {
      intent: 'snooze',
      snoozeMinutes: minutes,
      confidence: 0.9,
    };
  }

  if (intent === 'move_task') {
    // Parse move command
    const moveMatch = lower.match(/move\s+(.+?)\s+to\s+(idea|todo|done)s?/i);
    if (moveMatch) {
      const targetStatus = moveMatch[2].toUpperCase() as 'IDEA' | 'TODO' | 'DONE';
      return {
        intent: 'move_task',
        task: { title: moveMatch[1], status: targetStatus === 'DONE' ? 'TODO' : targetStatus },
        confidence: 0.85,
      };
    }
  }

  // Handle task creation
  if (intent === 'create_task') {
    // Extract title
    const title = extractTaskTitle(text);

    // Parse datetime
    let reminderAt = parseDateTime(text, timezone, currentTime);
    reminderAt = applyDefaultTimeRules(reminderAt, text, timezone);

    // Determine status
    const status = detectedStatus || (reminderAt ? 'TODO' : 'TODO');

    // Ideas don't get reminders unless explicitly asked
    const finalReminderAt = status === 'IDEA' ? undefined : reminderAt;

    return {
      intent: 'create_task',
      task: {
        title: title || text,
        status,
        ...(finalReminderAt && { reminderAt: finalReminderAt.toISOString() }),
      },
      confidence: title ? 0.85 : 0.7,
    };
  }

  // Unknown intent - store as idea to avoid losing data
  return {
    intent: 'unknown',
    task: {
      title: text,
      status: 'IDEA',
    },
    confidence: 0.3,
  };
}

async function parseWithAI(
  text: string,
  timezone: string,
  currentTime: Date
): Promise<AIParsedResult | null> {
  if (!openai) return null;

  const prompt = SYSTEM_PROMPT
    .replace('{{TIMEZONE}}', timezone)
    .replace('{{DATETIME}}', currentTime.toISOString());

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as AIParsedResult;

    // Validate and fix datetime strings
    if (parsed.task?.reminderAt) {
      try {
        new Date(parsed.task.reminderAt).toISOString();
      } catch {
        // If invalid, try to parse with chrono
        const dt = parseDateTime(text, timezone, currentTime);
        if (dt) {
          parsed.task.reminderAt = dt.toISOString();
        } else {
          delete parsed.task.reminderAt;
        }
      }
    }

    return parsed;
  } catch (error) {
    console.error('AI parsing error:', error);
    return null;
  }
}

// Helper to get "tomorrow 10am" time for a timezone
export function getTomorrow10am(timezone: string): Date {
  const now = new Date();
  const zonedNow = toZonedTime(now, timezone);
  const tomorrow = addDays(zonedNow, 1);
  const at10am = setMinutes(setHours(tomorrow, DEFAULT_REMINDER_HOUR), DEFAULT_REMINDER_MINUTE);
  return fromZonedTime(at10am, timezone);
}

// Parse snooze duration from various formats
export function parseSnoozeRequest(text: string): number {
  const lower = text.toLowerCase();

  // "tomorrow" or "tomorrow morning"
  if (lower.includes('tomorrow')) {
    return -1; // Special flag for "tomorrow 10am"
  }

  // "X minutes" or "Xmin" or "X mins"
  const minMatch = lower.match(/(\d+)\s*(?:min(?:ute)?s?)/i);
  if (minMatch) {
    return parseInt(minMatch[1]);
  }

  // "X hours" or "Xhr" or "Xh"
  const hourMatch = lower.match(/(\d+)\s*(?:h(?:(?:ou)?rs?)?)/i);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 60;
  }

  // Just a number - assume minutes
  const numMatch = lower.match(/(\d+)/);
  if (numMatch) {
    return parseInt(numMatch[1]);
  }

  // Default
  return 15;
}
