import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Task } from './api';

interface User {
  id: string;
  email?: string | null;
  whatsappNumber: string;
  timezone: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  snoozeMinutesDefault?: number;
  reminderLeadTime?: number;
  needsWhatsAppLink?: boolean;
}

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'auth-storage',
    }
  )
);

interface TasksState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  removeTask: (taskId: string) => void;
  moveTask: (taskId: string, newStatus: 'IDEA' | 'TODO' | 'DONE') => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  isLoading: false,
  error: null,
  setTasks: (tasks) => set({ tasks }),
  addTask: (task) => set((state) => ({ tasks: [task, ...state.tasks] })),
  updateTask: (taskId, updates) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    })),
  removeTask: (taskId) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== taskId) })),
  moveTask: (taskId, newStatus) =>
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, status: newStatus } : t
      ),
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));

// UI state
interface UIState {
  selectedTaskId: string | null;
  isDrawerOpen: boolean;
  selectTask: (taskId: string | null) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  selectedTaskId: null,
  isDrawerOpen: false,
  selectTask: (taskId) => set({ selectedTaskId: taskId, isDrawerOpen: !!taskId }),
  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false, selectedTaskId: null }),
}));
