'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, parseISO } from 'date-fns';
import { Clock, GripVertical, MoreVertical, Trash2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Task } from '@/lib/api';

interface TaskCardProps {
  task: Task;
  onSelect: () => void;
  onComplete: () => void;
  onDelete: () => void;
}

export function TaskCard({ task, onSelect, onComplete, onDelete }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return format(parseISO(dateStr), 'MMM d, h:mm a');
    } catch {
      return null;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-lg border bg-white p-3 shadow-sm transition-shadow hover:shadow-md',
        isDragging && 'opacity-50 shadow-lg',
        task.status === 'DONE' && 'bg-gray-50'
      )}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab p-1 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
      >
        <GripVertical size={16} />
      </button>

      <div className="ml-5">
        {/* Title */}
        <button
          onClick={onSelect}
          className={cn(
            'block w-full text-left text-sm font-medium text-gray-900 hover:text-blue-600',
            task.status === 'DONE' && 'text-gray-500 line-through'
          )}
        >
          {task.title}
        </button>

        {/* Notes preview */}
        {task.notes && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-500">{task.notes}</p>
        )}

        {/* Reminder time */}
        {task.reminderAt && task.status !== 'DONE' && (
          <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
            <Clock size={12} />
            <span>{formatDateTime(task.reminderAt)}</span>
          </div>
        )}

        {/* Source badge */}
        <div className="mt-2 flex items-center justify-between">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              task.source === 'WHATSAPP'
                ? 'bg-green-100 text-green-700'
                : 'bg-blue-100 text-blue-700'
            )}
          >
            {task.source === 'WHATSAPP' ? 'WhatsApp' : 'Web'}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            {task.status !== 'DONE' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete();
                }}
                className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600"
                title="Mark as done"
              >
                <CheckCircle size={16} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
