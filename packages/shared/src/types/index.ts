// Task status enum
export type TaskStatus = 'IDEA' | 'TODO' | 'DONE';

// Task source enum
export type TaskSource = 'WHATSAPP' | 'WEB';

// Message direction enum
export type MessageDirection = 'INBOUND' | 'OUTBOUND';

// Message channel enum
export type MessageChannel = 'WHATSAPP';

// Reminder delivery mode
export type ReminderDeliveryMode = 'SESSION_FREEFORM' | 'TEMPLATE';

// Reminder state
export type ReminderState =
  | 'SCHEDULED'
  | 'SENT'
  | 'ACKED_DONE'
  | 'ACKED_SNOOZE'
  | 'FAILED'
  | 'CANCELED';

// User interface
export interface User {
  id: string;
  createdAt: Date;
  name: string | null;
  email: string | null;
  whatsappNumber: string;
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  snoozeMinutesDefault: number;
  reminderLeadTime: number;
  lastInboundAt: Date | null;
  isOnboarded: boolean;
}

// Task interface
export interface Task {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  dueAt: Date | null;
  reminderAt: Date | null;
  recurrence: string | null;
  createdAt: Date;
  updatedAt: Date;
  source: TaskSource;
  externalRef: string | null;
}

// Reminder interface
export interface Reminder {
  id: string;
  taskId: string;
  userId: string;
  scheduledAt: Date;
  sentAt: Date | null;
  deliveryMode: ReminderDeliveryMode;
  messageId: string | null;
  state: ReminderState;
  retriesCount: number;
  lastError: string | null;
}

// Message event interface
export interface MessageEvent {
  id: string;
  userId: string;
  direction: MessageDirection;
  channel: MessageChannel;
  payload: Record<string, unknown>;
  createdAt: Date;
}

// AI Intent types
export type AIIntent =
  | 'create_task'
  | 'list_tasks'
  | 'mark_done'
  | 'snooze'
  | 'edit_task'
  | 'move_task'
  | 'set_pref'
  | 'help'
  | 'unknown';

// AI parsed result
export interface AIParsedResult {
  intent: AIIntent;
  task?: {
    title: string;
    notes?: string;
    status?: 'IDEA' | 'TODO';
    dueAt?: string;
    reminderAt?: string;
  };
  taskId?: string;
  snoozeMinutes?: number;
  pref?: {
    timezone?: string;
    quietHoursStart?: string;
    quietHoursEnd?: string;
    snoozeMinutesDefault?: number;
  };
  confidence: number;
}

// WhatsApp types
export interface WhatsAppInboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'interactive' | 'button';
  text?: {
    body: string;
  };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: {
      id: string;
      title: string;
    };
    list_reply?: {
      id: string;
      title: string;
      description?: string;
    };
  };
  button?: {
    payload: string;
    text: string;
  };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: {
            name: string;
          };
          wa_id: string;
        }>;
        messages?: WhatsAppInboundMessage[];
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Board column type for web dashboard
export interface BoardColumn {
  id: TaskStatus;
  title: string;
  tasks: Task[];
}
