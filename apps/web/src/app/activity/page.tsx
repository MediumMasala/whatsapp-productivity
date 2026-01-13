'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { activityApi } from '@/lib/api';
import { Navbar } from '@/components/Navbar';
import { cn } from '@/lib/utils';

interface ActivityEvent {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  payload: Record<string, unknown>;
  createdAt: string;
}

export default function ActivityPage() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const fetchActivity = useCallback(async (pageNum: number = 1) => {
    if (!token) return;

    setIsLoading(true);
    try {
      const response = await activityApi.list(token, pageNum);
      if (pageNum === 1) {
        setEvents(response.data.items);
      } else {
        setEvents((prev) => [...prev, ...response.data.items]);
      }
      setHasMore(response.data.hasMore);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to fetch activity:', error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    fetchActivity(1);
  }, [token, router, fetchActivity]);

  const getEventDescription = (event: ActivityEvent): string => {
    const payload = event.payload as Record<string, unknown>;

    if (payload.text) {
      return `"${String(payload.text).slice(0, 100)}${String(payload.text).length > 100 ? '...' : ''}"`;
    }

    if (payload.type === 'reminder') {
      return 'Reminder sent';
    }

    if (payload.messageId) {
      return `Message ${event.direction === 'INBOUND' ? 'received' : 'sent'}`;
    }

    return JSON.stringify(payload).slice(0, 100);
  };

  if (!token) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
              <p className="mt-1 text-sm text-gray-500">
                WhatsApp message history
              </p>
            </div>

            <button
              onClick={() => fetchActivity(1)}
              disabled={isLoading}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-gray-600 hover:bg-white hover:text-gray-900 disabled:opacity-50"
            >
              <RefreshCw size={18} className={cn(isLoading && 'animate-spin')} />
              Refresh
            </button>
          </div>

          {/* Events list */}
          <div className="space-y-3">
            {events.length === 0 && !isLoading && (
              <div className="rounded-xl bg-white p-8 text-center shadow-sm">
                <p className="text-gray-500">No activity yet</p>
              </div>
            )}

            {events.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-4 rounded-xl bg-white p-4 shadow-sm"
              >
                <div
                  className={cn(
                    'rounded-full p-2',
                    event.direction === 'INBOUND'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-green-100 text-green-600'
                  )}
                >
                  {event.direction === 'INBOUND' ? (
                    <ArrowDownRight size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900">
                      {event.direction === 'INBOUND' ? 'Received' : 'Sent'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {format(parseISO(event.createdAt), 'MMM d, h:mm a')}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-gray-600">
                    {getEventDescription(event)}
                  </p>
                </div>
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <button
                onClick={() => fetchActivity(page + 1)}
                disabled={isLoading}
                className="w-full rounded-lg border border-gray-300 bg-white py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
