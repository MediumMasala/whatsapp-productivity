'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { userApi, authApi } from '@/lib/api';
import { Navbar } from '@/components/Navbar';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Australia/Sydney',
];

export default function SettingsPage() {
  const router = useRouter();
  const { token, user, updateUser } = useAuthStore();

  const [timezone, setTimezone] = useState('');
  const [quietHoursStart, setQuietHoursStart] = useState('');
  const [quietHoursEnd, setQuietHoursEnd] = useState('');
  const [snoozeMinutesDefault, setSnoozeMinutesDefault] = useState(15);
  const [reminderLeadTime, setReminderLeadTime] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }

    if (user) {
      setTimezone(user.timezone);
      setQuietHoursStart(user.quietHoursStart || '');
      setQuietHoursEnd(user.quietHoursEnd || '');
      setSnoozeMinutesDefault(user.snoozeMinutesDefault ?? 15);
      setReminderLeadTime(user.reminderLeadTime ?? 0);
    }
  }, [token, user, router]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setIsSaving(true);
    setMessage('');

    try {
      await userApi.update(token, {
        timezone,
        quietHoursStart: quietHoursStart || null,
        quietHoursEnd: quietHoursEnd || null,
        snoozeMinutesDefault,
        reminderLeadTime,
      });

      // Refresh user data
      const meResponse = await authApi.getMe(token);
      updateUser(meResponse.user);

      setMessage('Settings saved successfully!');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!token) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Navbar />

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 py-8">
          <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Account info */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-gray-900">Account</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <p className="mt-1 text-gray-900">{user?.email || 'Not set'}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    WhatsApp Number
                  </label>
                  <p className="mt-1 text-gray-900">{user?.whatsappNumber || 'Not linked'}</p>
                </div>
              </div>
            </div>

            {/* Timezone */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-gray-900">Timezone</h2>

              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>

            {/* Quiet hours */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-gray-900">Quiet Hours</h2>
              <p className="mb-4 text-sm text-gray-500">
                Reminders won&apos;t be sent during quiet hours
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Start</label>
                  <input
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">End</label>
                  <input
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>

            {/* Defaults */}
            <div className="rounded-xl bg-white p-6 shadow-sm">
              <h2 className="mb-4 font-semibold text-gray-900">Defaults</h2>

              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Default snooze duration (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={snoozeMinutesDefault}
                    onChange={(e) => setSnoozeMinutesDefault(parseInt(e.target.value) || 15)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    Reminder lead time (minutes before due)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={reminderLeadTime}
                    onChange={(e) => setReminderLeadTime(parseInt(e.target.value) || 0)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>

            {/* Message */}
            {message && (
              <div
                className={`rounded-lg p-4 ${
                  message.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {message}
              </div>
            )}

            {/* Save button */}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
