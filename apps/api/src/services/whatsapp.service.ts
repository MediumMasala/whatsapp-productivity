import { config } from '../lib/config.js';
import { createChildLogger } from '../lib/logger.js';
import prisma from '../lib/prisma.js';
import {
  isWithinSessionWindow,
  formatRelativeTime,
  truncate,
  sanitizeForLogging,
} from '@whatsapp-productivity/shared';
import {
  WHATSAPP_REMINDER_TEMPLATE_NAME,
  QUICK_REPLY_IDS,
} from '@whatsapp-productivity/shared';
import type { Task, User } from '@prisma/client';

const logger = createChildLogger('whatsapp-service');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function callWhatsAppAPI(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const url = `${WHATSAPP_API_URL}/${config.whatsappPhoneNumberId}/${endpoint}`;

  logger.debug({ endpoint, body: sanitizeForLogging(body) }, 'Calling WhatsApp API');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.whatsappAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error({ status: response.status, data }, 'WhatsApp API error');
      return { ok: false, error: JSON.stringify(data) };
    }

    return { ok: true, data };
  } catch (error) {
    logger.error({ error }, 'WhatsApp API call failed');
    return { ok: false, error: String(error) };
  }
}

export async function sendTextMessage(
  to: string,
  text: string
): Promise<SendMessageResult> {
  const result = await callWhatsAppAPI('messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text },
  });

  if (result.ok && result.data) {
    const data = result.data as { messages?: Array<{ id: string }> };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  }

  return { success: false, error: result.error };
}

export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>
): Promise<SendMessageResult> {
  const result = await callWhatsAppAPI('messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: buttons.slice(0, 3).map((btn) => ({
          type: 'reply',
          reply: {
            id: btn.id,
            title: btn.title.slice(0, 20), // Max 20 chars
          },
        })),
      },
    },
  });

  if (result.ok && result.data) {
    const data = result.data as { messages?: Array<{ id: string }> };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  }

  return { success: false, error: result.error };
}

export async function sendInteractiveList(
  to: string,
  bodyText: string,
  buttonText: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>
): Promise<SendMessageResult> {
  const result = await callWhatsAppAPI('messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: bodyText },
      action: {
        button: buttonText,
        sections,
      },
    },
  });

  if (result.ok && result.data) {
    const data = result.data as { messages?: Array<{ id: string }> };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  }

  return { success: false, error: result.error };
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  parameters: string[]
): Promise<SendMessageResult> {
  const result = await callWhatsAppAPI('messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: parameters.map((p) => ({
            type: 'text',
            text: p,
          })),
        },
      ],
    },
  });

  if (result.ok && result.data) {
    const data = result.data as { messages?: Array<{ id: string }> };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  }

  return { success: false, error: result.error };
}

export async function sendTaskCreatedConfirmation(
  user: User,
  task: Task
): Promise<SendMessageResult> {
  const statusEmoji = task.status === 'IDEA' ? '💡' : '✅';
  const statusLabel = task.status === 'IDEA' ? 'ideas' : 'to-do';

  let message = `${statusEmoji} added to ${statusLabel}: ${task.title}`;

  if (task.reminderAt) {
    const timeStr = formatRelativeTime(task.reminderAt, user.timezone);
    message += ` — ${timeStr}. i'll remind you.`;
  }

  return sendTextMessage(user.whatsappNumber, message);
}

export async function sendReminderMessage(
  user: User,
  task: Task
): Promise<{ result: SendMessageResult; deliveryMode: 'SESSION_FREEFORM' | 'TEMPLATE' }> {
  const withinSession = isWithinSessionWindow(user.lastInboundAt);
  const timeStr = task.dueAt
    ? formatRelativeTime(task.dueAt, user.timezone)
    : task.reminderAt
    ? formatRelativeTime(task.reminderAt, user.timezone)
    : 'now';

  if (withinSession) {
    // Send interactive message with buttons
    const bodyText = `🔔 reminder: ${task.title}\n(${timeStr})\n\ndone?`;

    const result = await sendInteractiveButtons(user.whatsappNumber, bodyText, [
      { id: `${QUICK_REPLY_IDS.DONE}_${task.id}`, title: '✅ Done' },
      { id: `${QUICK_REPLY_IDS.SNOOZE}_${task.id}`, title: '⏰ Snooze' },
      { id: `${QUICK_REPLY_IDS.EDIT}_${task.id}`, title: '✏️ Edit' },
    ]);

    return { result, deliveryMode: 'SESSION_FREEFORM' };
  } else {
    // Send template message (outside 24h window)
    const result = await sendTemplateMessage(
      user.whatsappNumber,
      WHATSAPP_REMINDER_TEMPLATE_NAME,
      [truncate(task.title, 60), timeStr]
    );

    return { result, deliveryMode: 'TEMPLATE' };
  }
}

export async function sendSnoozeOptions(
  user: User,
  taskId: string
): Promise<SendMessageResult> {
  return sendInteractiveList(
    user.whatsappNumber,
    'How long do you want to snooze?',
    'Snooze options',
    [
      {
        title: 'Snooze for...',
        rows: [
          { id: `${QUICK_REPLY_IDS.SNOOZE_15}_${taskId}`, title: '15 minutes' },
          { id: `${QUICK_REPLY_IDS.SNOOZE_60}_${taskId}`, title: '1 hour' },
          { id: `${QUICK_REPLY_IDS.SNOOZE_180}_${taskId}`, title: '3 hours' },
          {
            id: `${QUICK_REPLY_IDS.SNOOZE_TOMORROW}_${taskId}`,
            title: 'Tomorrow 10am',
          },
        ],
      },
    ]
  );
}

export async function sendTaskList(
  user: User,
  tasks: Task[],
  listType: 'TODO' | 'IDEA' = 'TODO'
): Promise<SendMessageResult> {
  if (tasks.length === 0) {
    const message =
      listType === 'IDEA'
        ? "No ideas saved yet. Send 'idea: your idea' to add one."
        : "No tasks yet. Send me a reminder or task to get started!";
    return sendTextMessage(user.whatsappNumber, message);
  }

  const emoji = listType === 'IDEA' ? '💡' : '📋';
  const header = listType === 'IDEA' ? 'Your ideas' : 'Your tasks';

  let message = `${emoji} ${header}:\n\n`;

  tasks.slice(0, 10).forEach((task, i) => {
    const timeStr = task.reminderAt
      ? ` (${formatRelativeTime(task.reminderAt, user.timezone)})`
      : '';
    message += `${i + 1}. ${task.title}${timeStr}\n`;
  });

  if (tasks.length > 10) {
    message += `\n...and ${tasks.length - 10} more`;
  }

  return sendTextMessage(user.whatsappNumber, message);
}

export async function sendHelpMessage(user: User): Promise<SendMessageResult> {
  const message = `Here's how I can help:

📝 *Create tasks*
"remind me tomorrow 9am to send the deck"
"todo: review the proposal"
"idea: build a newsletter app"

✅ *Manage tasks*
"done" - mark last reminder done
"snooze 1h" - snooze reminder
"list" - show your tasks
"ideas" - show saved ideas

⚙️ *Settings*
"settings" - open web dashboard

Just send me natural messages and I'll understand!`;

  return sendTextMessage(user.whatsappNumber, message);
}

export async function sendWebDashboardNotification(
  user: User,
  task: Task,
  action: 'done' | 'moved'
): Promise<SendMessageResult | null> {
  // Only send if within session window
  if (!isWithinSessionWindow(user.lastInboundAt)) {
    return null;
  }

  const message =
    action === 'done'
      ? `✅ marked done: ${task.title}`
      : `📋 task updated: ${task.title} → ${task.status}`;

  return sendTextMessage(user.whatsappNumber, message);
}

export async function logMessageEvent(
  userId: string,
  direction: 'INBOUND' | 'OUTBOUND',
  payload: Record<string, unknown>
): Promise<void> {
  await prisma.messageEvent.create({
    data: {
      userId,
      direction,
      channel: 'WHATSAPP',
      payload: sanitizeForLogging(payload),
    },
  });
}
