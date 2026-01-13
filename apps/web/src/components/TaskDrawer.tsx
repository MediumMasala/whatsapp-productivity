'use client';

import { useState, useEffect } from 'react';
import { X, Clock, Calendar, Trash2, CheckCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Task } from '@/lib/api';

interface TaskDrawerProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Task>) => Promise<void>;
  onDelete: () => Promise<void>;
  onComplete: () => Promise<void>;
}

export function TaskDrawer({
  task,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  onComplete,
}: TaskDrawerProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setNotes(task.notes || '');
      setDueAt(task.dueAt ? format(parseISO(task.dueAt), "yyyy-MM-dd'T'HH:mm") : '');
      setReminderAt(
        task.reminderAt ? format(parseISO(task.reminderAt), "yyyy-MM-dd'T'HH:mm") : ''
      );
    }
  }, [task]);

  const handleSave = async () => {
    if (!task) return;

    setIsSaving(true);
    try {
      await onUpdate({
        title,
        notes: notes || null,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    await onDelete();
    onClose();
  };

  if (!task) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/20 transition-opacity',
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed bottom-0 right-0 top-0 w-full max-w-md transform bg-white shadow-xl transition-transform',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Edit Task</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex h-full flex-col overflow-y-auto p-6 pb-32">
          {/* Status badge */}
          <div className="mb-6 flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium',
                task.status === 'IDEA' && 'bg-purple-100 text-purple-700',
                task.status === 'TODO' && 'bg-blue-100 text-blue-700',
                task.status === 'DONE' && 'bg-green-100 text-green-700'
              )}
            >
              {task.status === 'IDEA' && '💡 Idea'}
              {task.status === 'TODO' && '📋 To-Do'}
              {task.status === 'DONE' && '✅ Done'}
            </span>
            <span className="text-sm text-gray-500">
              via {task.source === 'WHATSAPP' ? 'WhatsApp' : 'Web'}
            </span>
          </div>

          {/* Title */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Task title"
            />
          </div>

          {/* Notes */}
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[100px] w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Add notes..."
            />
          </div>

          {/* Due date */}
          <div className="mb-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Calendar size={16} />
              Due Date
            </label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Reminder */}
          <div className="mb-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
              <Clock size={16} />
              Reminder
            </label>
            <input
              type="datetime-local"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {/* Created at */}
          <div className="mt-4 text-sm text-gray-500">
            Created {format(parseISO(task.createdAt), 'MMM d, yyyy h:mm a')}
          </div>
        </div>

        {/* Footer */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t bg-white px-6 py-4">
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-red-600 hover:bg-red-50"
            >
              <Trash2 size={18} />
              Delete
            </button>

            {task.status !== 'DONE' && (
              <button
                onClick={onComplete}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-green-600 hover:bg-green-50"
              >
                <CheckCircle size={18} />
                Complete
              </button>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </>
  );
}
