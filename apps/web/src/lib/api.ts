const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
}

export async function api<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API request failed');
  }

  return data;
}

// Auth API - WhatsApp-based login
export const authApi = {
  requestOtp: (whatsappNumber: string) =>
    api<{ success: boolean; message: string; devOtp?: string }>('/auth/request-otp', {
      method: 'POST',
      body: { whatsappNumber },
    }),

  verifyOtp: (whatsappNumber: string, otp: string) =>
    api<{
      success: boolean;
      token: string;
      user: {
        id: string;
        email: string | null;
        whatsappNumber: string;
        timezone: string;
        name: string | null;
      };
    }>('/auth/verify-otp', {
      method: 'POST',
      body: { whatsappNumber, otp },
    }),

  getMe: (token: string) =>
    api<{
      success: boolean;
      user: {
        id: string;
        email: string | null;
        whatsappNumber: string;
        timezone: string;
        name: string | null;
        quietHoursStart: string | null;
        quietHoursEnd: string | null;
        snoozeMinutesDefault: number;
        reminderLeadTime: number;
      };
    }>('/me', { token }),
};

// Tasks API
export interface Task {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  status: 'IDEA' | 'TODO' | 'DONE';
  dueAt: string | null;
  reminderAt: string | null;
  recurrence: string | null;
  createdAt: string;
  updatedAt: string;
  source: 'WHATSAPP' | 'WEB';
}

export const tasksApi = {
  list: (token: string, params?: { status?: string; q?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return api<{
      success: boolean;
      data: {
        items: Task[];
        total: number;
        page: number;
        pageSize: number;
        hasMore: boolean;
      };
    }>(`/tasks${query ? `?${query}` : ''}`, { token });
  },

  create: (
    token: string,
    task: {
      title: string;
      notes?: string;
      status?: 'IDEA' | 'TODO' | 'DONE';
      dueAt?: string;
      reminderAt?: string;
    }
  ) =>
    api<{ success: boolean; data: Task }>('/tasks', {
      method: 'POST',
      body: { ...task, source: 'WEB' },
      token,
    }),

  update: (
    token: string,
    taskId: string,
    updates: {
      title?: string;
      notes?: string | null;
      status?: 'IDEA' | 'TODO' | 'DONE';
      dueAt?: string | null;
      reminderAt?: string | null;
    }
  ) =>
    api<{ success: boolean; data: Task }>(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: updates,
      token,
    }),

  delete: (token: string, taskId: string) =>
    api<{ success: boolean }>(`/tasks/${taskId}`, {
      method: 'DELETE',
      token,
    }),

  complete: (token: string, taskId: string) =>
    api<{ success: boolean; data: Task }>(`/tasks/${taskId}/complete`, {
      method: 'POST',
      token,
    }),

  snooze: (token: string, taskId: string, minutes: number) =>
    api<{ success: boolean; data: { task: Task; newReminderAt: string } }>(
      `/tasks/${taskId}/snooze`,
      {
        method: 'POST',
        body: { minutes },
        token,
      }
    ),
};

// User API
export const userApi = {
  update: (
    token: string,
    updates: {
      timezone?: string;
      quietHoursStart?: string | null;
      quietHoursEnd?: string | null;
      snoozeMinutesDefault?: number;
      reminderLeadTime?: number;
    }
  ) =>
    api<{ success: boolean; data: unknown }>('/users/me', {
      method: 'PATCH',
      body: updates,
      token,
    }),
};

// Activity API
export const activityApi = {
  list: (token: string, page = 1) =>
    api<{
      success: boolean;
      data: {
        items: Array<{
          id: string;
          direction: 'INBOUND' | 'OUTBOUND';
          payload: Record<string, unknown>;
          createdAt: string;
        }>;
        total: number;
        page: number;
        hasMore: boolean;
      };
    }>(`/activity?page=${page}`, { token }),
};
