import {
  parseMessage,
  getTomorrow10am,
  parseSnoozeRequest,
  type ParseContext,
} from './parser.js';
import type { AIParsedResult, Task, User } from '@whatsapp-productivity/shared';
import { DEFAULT_SNOOZE_MINUTES, AI_CONFIDENCE_THRESHOLD } from '@whatsapp-productivity/shared';
import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export interface MessageHandlerDeps {
  // User operations
  findUserByWhatsApp: (phone: string) => Promise<User | null>;
  getOrCreateUserByWhatsApp: (phone: string) => Promise<User>;
  updateLastInbound: (userId: string) => Promise<void>;
  updateUserName: (userId: string, name: string) => Promise<User>;
  markUserOnboarded: (userId: string) => Promise<User>;

  // Task operations
  createTask: (input: {
    userId: string;
    title: string;
    notes?: string;
    status?: 'IDEA' | 'TODO' | 'DONE';
    dueAt?: Date;
    reminderAt?: Date;
    source?: 'WHATSAPP' | 'WEB';
  }) => Promise<Task>;
  getTasksByUser: (
    userId: string,
    filters?: { status?: 'IDEA' | 'TODO' | 'DONE' }
  ) => Promise<{ tasks: Task[]; total: number }>;
  getTaskById: (taskId: string) => Promise<Task | null>;
  markTaskDone: (taskId: string) => Promise<Task>;
  moveTask: (taskId: string, status: 'IDEA' | 'TODO' | 'DONE') => Promise<Task>;
  snoozeTask: (taskId: string, minutes: number) => Promise<{ task: Task }>;

  // Reminder operations
  getRecentSentReminder: (userId: string) => Promise<{ task: Task } | null>;

  // WhatsApp operations
  sendTextMessage: (to: string, text: string) => Promise<{ success: boolean }>;
  sendReaction: (to: string, messageId: string, emoji: string) => Promise<{ success: boolean }>;
  sendTaskCreatedConfirmation: (
    user: User,
    task: Task
  ) => Promise<{ success: boolean }>;
  sendTaskList: (
    user: User,
    tasks: Task[],
    listType: 'TODO' | 'IDEA'
  ) => Promise<{ success: boolean }>;
  sendHelpMessage: (user: User) => Promise<{ success: boolean }>;
  sendSnoozeOptions: (user: User, taskId: string) => Promise<{ success: boolean }>;
  logMessageEvent: (
    userId: string,
    direction: 'INBOUND' | 'OUTBOUND',
    payload: Record<string, unknown>
  ) => Promise<void>;
}

export interface HandleMessageResult {
  success: boolean;
  action: string;
  task?: Task;
  error?: string;
}

// Format time in 12-hour AM/PM format for IST
function formatTimeIST(date: Date, timezone: string = 'Asia/Kolkata'): string {
  const zonedDate = toZonedTime(date, timezone);
  return format(zonedDate, 'h:mm a');
}

// Format date in friendly format
function formatDateIST(date: Date, timezone: string = 'Asia/Kolkata'): string {
  const zonedDate = toZonedTime(date, timezone);
  const today = toZonedTime(new Date(), timezone);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (zonedDate.toDateString() === today.toDateString()) {
    return `today at ${format(zonedDate, 'h:mm a')}`;
  } else if (zonedDate.toDateString() === tomorrow.toDateString()) {
    return `tomorrow at ${format(zonedDate, 'h:mm a')}`;
  } else {
    return format(zonedDate, "EEEE, MMM d 'at' h:mm a");
  }
}

export async function handleInboundMessage(
  from: string,
  text: string,
  deps: MessageHandlerDeps,
  messageId?: string
): Promise<HandleMessageResult> {
  try {
    // Get or create user
    const user = await deps.getOrCreateUserByWhatsApp(from);

    // Update last inbound timestamp (for session window tracking)
    await deps.updateLastInbound(user.id);

    // Log inbound message
    await deps.logMessageEvent(user.id, 'INBOUND', {
      from,
      text,
      messageId,
      timestamp: new Date().toISOString(),
    });

    // Check if user needs onboarding
    if (!user.isOnboarded) {
      return await handleOnboarding(user, text, deps, messageId);
    }

    // Parse the message
    const context: ParseContext = {
      timezone: user.timezone,
      currentTime: new Date(),
    };

    const parsed = await parseMessage(text, context);

    // Handle based on intent
    return await processIntent(user, text, parsed, deps, messageId);
  } catch (error) {
    console.error('Error handling message:', error);
    return {
      success: false,
      action: 'error',
      error: String(error),
    };
  }
}

async function handleOnboarding(
  user: User,
  text: string,
  deps: MessageHandlerDeps,
  messageId?: string
): Promise<HandleMessageResult> {
  const trimmedText = text.trim();

  // If user doesn't have a name yet, this message is their name
  if (!user.name) {
    // Check if this looks like a name (not a command)
    const lowerText = trimmedText.toLowerCase();
    const isCommand = ['hi', 'hello', 'hey', 'start', 'help', '/start'].includes(lowerText);

    if (isCommand || trimmedText.length < 2) {
      // Send welcome message asking for name
      await deps.sendTextMessage(
        user.whatsappNumber,
        `👋 Hey there! I'm your personal reminder assistant.\n\nI'll help you remember everything that matters. Just tell me what to remind you about, and I'll make sure you never forget!\n\nFirst, what should I call you?`
      );
      return { success: true, action: 'onboarding_welcome' };
    }

    // Save the name
    const name = trimmedText.split(' ')[0]; // Take first word as name
    await deps.updateUserName(user.id, name);
    await deps.markUserOnboarded(user.id);

    // React with thumbs up
    if (messageId) {
      await deps.sendReaction(user.whatsappNumber, messageId, '👍');
    }

    // Send personalized welcome
    await deps.sendTextMessage(
      user.whatsappNumber,
      `Nice to meet you, ${name}! 🎉\n\nI'm ready to be your reminder buddy. Here's how we'll work together:\n\n📝 Just text me things like:\n• "Remind me to call mom at 3 PM"\n• "Meeting with team tomorrow 10 AM"\n• "Buy groceries at 6:30 PM"\n\nI'll note it down and ping you right on time! ⏰\n\nGo ahead, try sending me your first reminder!`
    );

    return { success: true, action: 'onboarding_complete' };
  }

  // User has name but isn't marked onboarded (edge case)
  await deps.markUserOnboarded(user.id);
  return await handleInboundMessage(user.whatsappNumber, text, deps, messageId);
}

async function processIntent(
  user: User,
  originalText: string,
  parsed: AIParsedResult,
  deps: MessageHandlerDeps,
  messageId?: string
): Promise<HandleMessageResult> {
  switch (parsed.intent) {
    case 'create_task':
      return handleCreateTask(user, parsed, deps, messageId);

    case 'list_tasks':
      return handleListTasks(user, parsed, deps);

    case 'mark_done':
      return handleMarkDone(user, parsed, deps, messageId);

    case 'snooze':
      return handleSnooze(user, parsed, deps);

    case 'move_task':
      return handleMoveTask(user, parsed, deps);

    case 'help':
      await deps.sendHelpMessage(user);
      return { success: true, action: 'help_sent' };

    case 'set_pref':
      await deps.sendTextMessage(
        user.whatsappNumber,
        `⚙️ Visit your dashboard to update settings:\nhttps://wa-productivity-app.vercel.app/settings`
      );
      return { success: true, action: 'settings_link_sent' };

    case 'unknown':
    default:
      // Low confidence - store as idea and ask for clarification
      if (parsed.confidence < AI_CONFIDENCE_THRESHOLD && parsed.task?.title) {
        const task = await deps.createTask({
          userId: user.id,
          title: parsed.task.title,
          status: 'IDEA',
          source: 'WHATSAPP',
        });

        // React with lightbulb for idea
        if (messageId) {
          await deps.sendReaction(user.whatsappNumber, messageId, '💡');
        }

        await deps.sendTextMessage(
          user.whatsappNumber,
          `💡 Noted as an idea: "${task.title}"\n\nTip: Say "remind me [time] to [task]" for timed reminders!`
        );

        return { success: true, action: 'saved_as_idea', task };
      }

      await deps.sendHelpMessage(user);
      return { success: true, action: 'help_sent' };
  }
}

async function handleCreateTask(
  user: User,
  parsed: AIParsedResult,
  deps: MessageHandlerDeps,
  messageId?: string
): Promise<HandleMessageResult> {
  if (!parsed.task?.title) {
    await deps.sendTextMessage(
      user.whatsappNumber,
      "Hmm, I couldn't catch that. Could you try again? For example:\n\"Remind me to call the dentist at 4 PM\""
    );
    return { success: false, action: 'invalid_task', error: 'No title' };
  }

  const task = await deps.createTask({
    userId: user.id,
    title: parsed.task.title,
    notes: parsed.task.notes,
    status: parsed.task.status || 'TODO',
    reminderAt: parsed.task.reminderAt ? new Date(parsed.task.reminderAt) : undefined,
    source: 'WHATSAPP',
  });

  // React with memo/note emoji when task is noted
  if (messageId) {
    await deps.sendReaction(user.whatsappNumber, messageId, '📝');
  }

  // Send confirmation with friendly time format
  const greeting = user.name ? `Got it, ${user.name}!` : 'Got it!';

  if (task.reminderAt) {
    const timeStr = formatDateIST(task.reminderAt, user.timezone);
    await deps.sendTextMessage(
      user.whatsappNumber,
      `${greeting} ✅\n\n📌 "${task.title}"\n⏰ I'll remind you ${timeStr}\n\nRelax, I've got your back! 😊`
    );
  } else {
    await deps.sendTextMessage(
      user.whatsappNumber,
      `${greeting} ✅\n\n📌 Added to your to-do: "${task.title}"\n\nWant me to remind you at a specific time? Just tell me when!`
    );
  }

  return { success: true, action: 'task_created', task };
}

async function handleListTasks(
  user: User,
  parsed: AIParsedResult,
  deps: MessageHandlerDeps
): Promise<HandleMessageResult> {
  const listType = parsed.task?.status === 'IDEA' ? 'IDEA' : 'TODO';

  const { tasks } = await deps.getTasksByUser(user.id, {
    status: listType === 'IDEA' ? 'IDEA' : 'TODO',
  });

  if (tasks.length === 0) {
    const message = listType === 'IDEA'
      ? `No ideas saved yet, ${user.name || 'friend'}! 💭\n\nJust text me any thought and I'll save it.`
      : `Your task list is clear, ${user.name || 'friend'}! 🎉\n\nSend me something to remind you about.`;
    await deps.sendTextMessage(user.whatsappNumber, message);
  } else {
    await deps.sendTaskList(user, tasks, listType);
  }

  return { success: true, action: 'list_sent' };
}

async function handleMarkDone(
  user: User,
  parsed: AIParsedResult,
  deps: MessageHandlerDeps,
  messageId?: string
): Promise<HandleMessageResult> {
  let taskId = parsed.taskId;

  // If no specific task, find the most recent reminder
  if (!taskId) {
    const recent = await deps.getRecentSentReminder(user.id);
    if (recent) {
      taskId = recent.task.id;
    }
  }

  if (!taskId) {
    // Try to find task by title search
    const { tasks } = await deps.getTasksByUser(user.id, { status: 'TODO' });
    if (tasks.length === 1) {
      taskId = tasks[0].id;
    } else if (tasks.length > 1) {
      await deps.sendTextMessage(
        user.whatsappNumber,
        `Which task did you complete? You have ${tasks.length} active tasks. 📋`
      );
      return { success: false, action: 'ambiguous_task' };
    } else {
      await deps.sendTextMessage(
        user.whatsappNumber,
        `No active tasks to mark done! 🎉\n\nLooks like you're all caught up.`
      );
      return { success: false, action: 'no_tasks' };
    }
  }

  const task = await deps.markTaskDone(taskId);

  // React with checkmark
  if (messageId) {
    await deps.sendReaction(user.whatsappNumber, messageId, '✅');
  }

  const celebrationEmojis = ['🎉', '💪', '🙌', '⭐', '🏆'];
  const randomEmoji = celebrationEmojis[Math.floor(Math.random() * celebrationEmojis.length)];

  await deps.sendTextMessage(
    user.whatsappNumber,
    `${randomEmoji} Done: "${task.title}"\n\nGreat job${user.name ? `, ${user.name}` : ''}! Keep crushing it!`
  );

  return { success: true, action: 'task_done', task };
}

async function handleSnooze(
  user: User,
  parsed: AIParsedResult,
  deps: MessageHandlerDeps
): Promise<HandleMessageResult> {
  // Find the task to snooze
  let taskId = parsed.taskId;

  if (!taskId) {
    const recent = await deps.getRecentSentReminder(user.id);
    if (recent) {
      taskId = recent.task.id;
    }
  }

  if (!taskId) {
    await deps.sendTextMessage(
      user.whatsappNumber,
      "No recent reminder to snooze. 🤔"
    );
    return { success: false, action: 'no_reminder_to_snooze' };
  }

  // If just "snooze" without duration, show options
  if (!parsed.snoozeMinutes || parsed.snoozeMinutes === DEFAULT_SNOOZE_MINUTES) {
    await deps.sendSnoozeOptions(user, taskId);
    return { success: true, action: 'snooze_options_sent' };
  }

  // Calculate snooze time
  let minutes = parsed.snoozeMinutes;
  if (minutes === -1) {
    // Tomorrow 10am
    const tomorrow = getTomorrow10am(user.timezone);
    minutes = Math.ceil((tomorrow.getTime() - Date.now()) / 60000);
  }

  const { task } = await deps.snoozeTask(taskId, minutes);

  const newReminderTime = new Date(Date.now() + minutes * 60000);
  const timeStr = formatDateIST(newReminderTime, user.timezone);

  await deps.sendTextMessage(
    user.whatsappNumber,
    `⏰ Snoozed: "${task.title}"\n\nI'll remind you again ${timeStr}`
  );

  return { success: true, action: 'task_snoozed', task };
}

async function handleMoveTask(
  user: User,
  parsed: AIParsedResult,
  deps: MessageHandlerDeps
): Promise<HandleMessageResult> {
  await deps.sendTextMessage(
    user.whatsappNumber,
    `📱 Use the web dashboard to move tasks:\nhttps://wa-productivity-app.vercel.app/board`
  );

  return { success: true, action: 'move_instruction_sent' };
}

// Handle interactive button/list replies
export async function handleInteractiveReply(
  from: string,
  replyId: string,
  deps: MessageHandlerDeps
): Promise<HandleMessageResult> {
  const user = await deps.getOrCreateUserByWhatsApp(from);
  await deps.updateLastInbound(user.id);

  // Parse the reply ID (format: action_taskId)
  const [action, ...rest] = replyId.split('_');
  const taskId = rest.join('_');

  switch (action) {
    case 'action': {
      const subAction = rest[0];
      const actualTaskId = rest.slice(1).join('_');

      if (subAction === 'done') {
        const task = await deps.markTaskDone(actualTaskId);
        await deps.sendTextMessage(user.whatsappNumber, `✅ Done: "${task.title}"\n\nAwesome work! 🎉`);
        return { success: true, action: 'task_done', task };
      }

      if (subAction === 'snooze') {
        await deps.sendSnoozeOptions(user, actualTaskId);
        return { success: true, action: 'snooze_options_sent' };
      }

      if (subAction === 'edit') {
        await deps.sendTextMessage(
          user.whatsappNumber,
          "✏️ To edit, visit the dashboard or just send me the updated task!"
        );
        return { success: true, action: 'edit_instruction_sent' };
      }
      break;
    }

    case 'snooze': {
      const duration = rest[0];
      const actualTaskId = rest.slice(1).join('_');

      let minutes = DEFAULT_SNOOZE_MINUTES;
      if (duration === '15') minutes = 15;
      else if (duration === '60') minutes = 60;
      else if (duration === '180') minutes = 180;
      else if (duration === 'tomorrow') {
        const tomorrow = getTomorrow10am(user.timezone);
        minutes = Math.ceil((tomorrow.getTime() - Date.now()) / 60000);
      }

      const { task } = await deps.snoozeTask(actualTaskId, minutes);
      const newReminderTime = new Date(Date.now() + minutes * 60000);
      const timeStr = formatDateIST(newReminderTime, user.timezone);

      await deps.sendTextMessage(
        user.whatsappNumber,
        `⏰ Snoozed: "${task.title}"\n\nI'll remind you again ${timeStr}`
      );
      return { success: true, action: 'task_snoozed', task };
    }
  }

  return { success: false, action: 'unknown_reply', error: `Unknown reply: ${replyId}` };
}
