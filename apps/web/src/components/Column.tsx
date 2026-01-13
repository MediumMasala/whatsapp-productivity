'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TaskCard } from './TaskCard';
import type { Task } from '@/lib/api';

interface ColumnProps {
  id: 'IDEA' | 'TODO' | 'DONE';
  title: string;
  emoji: string;
  tasks: Task[];
  onTaskSelect: (taskId: string) => void;
  onTaskComplete: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
  onAddTask?: () => void;
}

export function Column({
  id,
  title,
  emoji,
  tasks,
  onTaskSelect,
  onTaskComplete,
  onTaskDelete,
  onAddTask,
}: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      className={cn(
        'flex h-full w-80 flex-shrink-0 flex-col rounded-xl bg-gray-100/80 transition-colors',
        isOver && 'bg-blue-50'
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between border-b border-gray-200/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{emoji}</span>
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
            {tasks.length}
          </span>
        </div>

        {onAddTask && (
          <button
            onClick={onAddTask}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-white hover:text-gray-700"
            title="Add task"
          >
            <Plus size={18} />
          </button>
        )}
      </div>

      {/* Tasks list */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto p-3"
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onSelect={() => onTaskSelect(task.id)}
                onComplete={() => onTaskComplete(task.id)}
                onDelete={() => onTaskDelete(task.id)}
              />
            ))}

            {tasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-3xl opacity-50">{emoji}</span>
                <p className="mt-2 text-sm text-gray-500">
                  {id === 'IDEA' && 'No ideas yet'}
                  {id === 'TODO' && 'No tasks to do'}
                  {id === 'DONE' && 'No completed tasks'}
                </p>
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
