'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AddTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (task: {
    title: string;
    notes?: string;
    status?: 'IDEA' | 'TODO';
    reminderAt?: string;
  }) => Promise<unknown>;
  defaultStatus?: 'IDEA' | 'TODO';
}

export function AddTaskModal({ isOpen, onClose, onAdd, defaultStatus = 'TODO' }: AddTaskModalProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'IDEA' | 'TODO'>(defaultStatus);
  const [reminderAt, setReminderAt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSubmitting(true);
    try {
      await onAdd({
        title: title.trim(),
        notes: notes.trim() || undefined,
        status,
        reminderAt: reminderAt ? new Date(reminderAt).toISOString() : undefined,
      });
      // Reset form
      setTitle('');
      setNotes('');
      setReminderAt('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add Task</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Status toggle */}
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setStatus('TODO')}
              className={cn(
                'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                status === 'TODO'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              📋 To-Do
            </button>
            <button
              type="button"
              onClick={() => setStatus('IDEA')}
              className={cn(
                'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                status === 'IDEA'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              )}
            >
              💡 Idea
            </button>
          </div>

          {/* Title */}
          <div className="mb-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="What do you need to do?"
              autoFocus
            />
          </div>

          {/* Notes */}
          <div className="mb-4">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="min-h-[80px] w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              placeholder="Add notes (optional)"
            />
          </div>

          {/* Reminder (only for TODO) */}
          {status === 'TODO' && (
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Remind me at (optional)
              </label>
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSubmitting}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
