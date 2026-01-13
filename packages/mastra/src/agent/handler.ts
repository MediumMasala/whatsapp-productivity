import {
  parseMessage,
  getTomorrow10am,
  parseSnoozeRequest,
  type ParseContext,
} from './parser.js';
import type { AIParsedResult, Task, User } from '@whatsapp-productivity/shared';
import { DEFAULT_SNOOZE_MINUTES, AI_CONFIDENCE_THRESHOLD } from '@whatsapp-productivity/shared';

export interface MessageHandlerDeps {
  // User operations
  findUserByWhatsApp: (phone: string) => Promise<User | null>;
  getOrCreateUserByWhatsApp: (phone: string) => Promise<User>;
  updateLastInbound: (userId: string) => Promise<void>;

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

export async function handleInboundMessage(
  from: string,
  text: string,
  deps: MessageHandlerDeps
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
      timestamp: new Date().toISOString(),
    });

    // Parse the message
    const context: ParseContext = {
      timezone: user.timezone,
      currentTime: new Date(),
    };

    const parsed = await parseMessage(text, context);

    // Handle based on intent
    return await processIntent(user, text, parsed, deps);
  } catch (error) {
    console.error('Error handling message:', error);
    return {
      success: false,
      action: 'error',
      error: String(error),
    };
  }
}

async function processIntent(
  user: User,
  originalText: string,
  parsed: AIParsedResult,
  deps: MessageHandlerDeps
): Promise<HandleMessageResult> {
  switch (parsed.intent) {
    case 'create_task':
      return handleCreateTask(user, parsed, deps);

    case 'list_tasks':
      return handleListTasks(user, parsed, deps);

    case 'mark_done':
      return handleMarkDone(user, parsed, deps);

    case 'snooze':
      return handleSnooze(user, parsed, deps);

    case 'move_task':
      return handleMoveTask(user, parsed, deps);

    case 'help':
      await deps.sendHelpMessage(user);
      return { success: true, action: 'help_sent' };

    case 'set_pref':
      // Send link to web dashboard
      await deps.sendTextMessage(
        user.whatsappNumber,
        "Visit your dashboard to update settings: your-app-url.com/settings"
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

        await deps.sendTextMessage(
          user.whatsappNumber,
          `💡 saved to ideas: ${task.title}\n\nTip: say "remind me [time] to [task]" for reminders`
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
  deps: MessageHandlerDeps
): Promise<HandleMessageResult> {
  if (!parsed.task?.title) {
    await deps.sendTextMessage(
      user.whatsappNumber,
      "I couldn't understand the task. Please try again."
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

  await deps.sendTaskCreatedConfirmation(user, task);

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

  await deps.sendTaskList(user, tasks, listType);

  return { success: true, action: 'list_sent' };
}

async function handleMarkDone(
  user: User,
  parsed: AIParsedResult,
  deps: MessageHandlerDeps
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
        "Which task did you complete? You have multiple active tasks."
      );
      return { success: false, action: 'ambiguous_task' };
    } else {
      await deps.sendTextMessage(
        user.whatsappNumber,
        "No active tasks found to mark done."
      );
      return { success: false, action: 'no_tasks' };
    }
  }

  const task = await deps.markTaskDone(taskId);

  await deps.sendTextMessage(
    user.whatsappNumber,
    `✅ done: ${task.title}`
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
      "No recent reminder to snooze."
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

  const timeStr = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
  await deps.sendTextMessage(
    user.whatsappNumber,
    `⏰ snoozed: ${task.title} — ${timeStr}`
  );

  return { success: true, action: 'task_snoozed', task };
}

async function handleMoveTask(
  user: User,
  parsed: AIParsedResult,
  deps: MessageHandlerDeps
): Promise<HandleMessageResult> {
  // This would need task search/identification logic
  // For MVP, send a message pointing to web dashboard
  await deps.sendTextMessage(
    user.whatsappNumber,
    "Use the web dashboard to move tasks between columns."
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
        await deps.sendTextMessage(user.whatsappNumber, `✅ done: ${task.title}`);
        return { success: true, action: 'task_done', task };
      }

      if (subAction === 'snooze') {
        await deps.sendSnoozeOptions(user, actualTaskId);
        return { success: true, action: 'snooze_options_sent' };
      }

      if (subAction === 'edit') {
        await deps.sendTextMessage(
          user.whatsappNumber,
          "To edit, visit the web dashboard or send a new task description."
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
      const timeStr = minutes >= 60 ? `${Math.round(minutes / 60)}h` : `${minutes}m`;
      await deps.sendTextMessage(user.whatsappNumber, `⏰ snoozed: ${task.title} — ${timeStr}`);
      return { success: true, action: 'task_snoozed', task };
    }
  }

  return { success: false, action: 'unknown_reply', error: `Unknown reply: ${replyId}` };
}
