'use client';

import { useCallback, useEffect } from 'react';
import { useAuthStore, useTasksStore } from '@/lib/store';
import { tasksApi, type Task } from '@/lib/api';

export function useTasks() {
  const token = useAuthStore((state) => state.token);
  const { tasks, isLoading, error, setTasks, addTask, updateTask, removeTask, setLoading, setError } =
    useTasksStore();

  const fetchTasks = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const response = await tasksApi.list(token);
      setTasks(response.data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setLoading(false);
    }
  }, [token, setTasks, setLoading, setError]);

  const createTask = useCallback(
    async (task: {
      title: string;
      notes?: string;
      status?: 'IDEA' | 'TODO' | 'DONE';
      dueAt?: string;
      reminderAt?: string;
    }) => {
      if (!token) throw new Error('Not authenticated');

      const response = await tasksApi.create(token, task);
      addTask(response.data);
      return response.data;
    },
    [token, addTask]
  );

  const editTask = useCallback(
    async (
      taskId: string,
      updates: {
        title?: string;
        notes?: string | null;
        status?: 'IDEA' | 'TODO' | 'DONE';
        dueAt?: string | null;
        reminderAt?: string | null;
      }
    ) => {
      if (!token) throw new Error('Not authenticated');

      const response = await tasksApi.update(token, taskId, updates);
      updateTask(taskId, response.data);
      return response.data;
    },
    [token, updateTask]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!token) throw new Error('Not authenticated');

      await tasksApi.delete(token, taskId);
      removeTask(taskId);
    },
    [token, removeTask]
  );

  const completeTask = useCallback(
    async (taskId: string) => {
      if (!token) throw new Error('Not authenticated');

      const response = await tasksApi.complete(token, taskId);
      updateTask(taskId, response.data);
      return response.data;
    },
    [token, updateTask]
  );

  const moveTaskStatus = useCallback(
    async (taskId: string, newStatus: 'IDEA' | 'TODO' | 'DONE') => {
      if (!token) throw new Error('Not authenticated');

      // Optimistic update
      updateTask(taskId, { status: newStatus });

      try {
        const response = await tasksApi.update(token, taskId, { status: newStatus });
        updateTask(taskId, response.data);
        return response.data;
      } catch (err) {
        // Revert on error
        await fetchTasks();
        throw err;
      }
    },
    [token, updateTask, fetchTasks]
  );

  // Fetch tasks on mount
  useEffect(() => {
    if (token) {
      fetchTasks();
    }
  }, [token, fetchTasks]);

  // Group tasks by status
  const tasksByStatus = {
    IDEA: tasks.filter((t) => t.status === 'IDEA'),
    TODO: tasks.filter((t) => t.status === 'TODO'),
    DONE: tasks.filter((t) => t.status === 'DONE'),
  };

  return {
    tasks,
    tasksByStatus,
    isLoading,
    error,
    fetchTasks,
    createTask,
    editTask,
    deleteTask,
    completeTask,
    moveTaskStatus,
  };
}
