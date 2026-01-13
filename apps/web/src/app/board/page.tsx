'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useAuthStore, useUIStore, useTasksStore } from '@/lib/store';
import { useTasks } from '@/hooks/useTasks';
import { Navbar } from '@/components/Navbar';
import { Column } from '@/components/Column';
import { TaskCard } from '@/components/TaskCard';
import { TaskDrawer } from '@/components/TaskDrawer';
import { AddTaskModal } from '@/components/AddTaskModal';
import type { Task } from '@/lib/api';

const COLUMNS = [
  { id: 'IDEA' as const, title: 'Ideas', emoji: '💡' },
  { id: 'TODO' as const, title: 'To-Do', emoji: '📋' },
  { id: 'DONE' as const, title: 'Done', emoji: '✅' },
];

export default function BoardPage() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const { selectedTaskId, isDrawerOpen, selectTask, closeDrawer } = useUIStore();
  const tasks = useTasksStore((state) => state.tasks);

  const {
    tasksByStatus,
    isLoading,
    createTask,
    editTask,
    deleteTask,
    completeTask,
    moveTaskStatus,
    fetchTasks,
  } = useTasks();

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalStatus, setAddModalStatus] = useState<'IDEA' | 'TODO'>('TODO');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Auth check
  useEffect(() => {
    if (!token) {
      router.push('/login');
    }
  }, [token, router]);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) || null;

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const overId = over.id as string;

    // Check if dropped on a column
    const targetColumn = COLUMNS.find((col) => col.id === overId);
    if (targetColumn) {
      const task = tasks.find((t) => t.id === taskId);
      if (task && task.status !== targetColumn.id) {
        await moveTaskStatus(taskId, targetColumn.id);
      }
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Optional: Handle drag over for visual feedback
  };

  const handleAddTask = (status: 'IDEA' | 'TODO') => {
    setAddModalStatus(status);
    setIsAddModalOpen(true);
  };

  if (!token) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1 overflow-x-auto">
        <div className="mx-auto max-w-full p-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Task Board</h1>
            <p className="mt-1 text-sm text-gray-500">
              Drag tasks between columns to update their status
            </p>
          </div>

          {/* Board */}
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="animate-pulse text-gray-500">Loading tasks...</div>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragOver={handleDragOver}
            >
              <div className="flex gap-6 pb-6">
                {COLUMNS.map((column) => (
                  <Column
                    key={column.id}
                    id={column.id}
                    title={column.title}
                    emoji={column.emoji}
                    tasks={tasksByStatus[column.id]}
                    onTaskSelect={selectTask}
                    onTaskComplete={completeTask}
                    onTaskDelete={async (taskId) => {
                      if (confirm('Delete this task?')) {
                        await deleteTask(taskId);
                      }
                    }}
                    onAddTask={
                      column.id !== 'DONE' ? () => handleAddTask(column.id) : undefined
                    }
                  />
                ))}
              </div>

              <DragOverlay>
                {activeTask && (
                  <div className="w-80 rotate-3 opacity-90">
                    <TaskCard
                      task={activeTask}
                      onSelect={() => {}}
                      onComplete={() => {}}
                      onDelete={() => {}}
                    />
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </main>

      {/* Task detail drawer */}
      <TaskDrawer
        task={selectedTask}
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        onUpdate={async (updates) => {
          if (selectedTaskId) {
            await editTask(selectedTaskId, updates);
          }
        }}
        onDelete={async () => {
          if (selectedTaskId) {
            await deleteTask(selectedTaskId);
            closeDrawer();
          }
        }}
        onComplete={async () => {
          if (selectedTaskId) {
            await completeTask(selectedTaskId);
            closeDrawer();
          }
        }}
      />

      {/* Add task modal */}
      <AddTaskModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={createTask}
        defaultStatus={addModalStatus}
      />
    </div>
  );
}
