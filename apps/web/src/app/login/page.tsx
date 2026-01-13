'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [step, setStep] = useState<'email' | 'otp' | 'whatsapp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [tempToken, setTempToken] = useState('');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await authApi.requestOtp(email);
      if (response.devOtp) {
        setDevOtp(response.devOtp);
      }
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await authApi.verifyOtp(email, otp);

      if (response.user.needsWhatsAppLink) {
        setTempToken(response.token);
        setStep('whatsapp');
      } else {
        setAuth(response.token, response.user);
        router.push('/board');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await authApi.linkWhatsApp(tempToken, whatsappNumber);
      const meResponse = await authApi.getMe(response.token);
      setAuth(response.token, meResponse.user);
      router.push('/board');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to link WhatsApp');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Productivity</h1>
          <p className="mt-2 text-sm text-gray-600">Manage your tasks with AI-powered reminders</p>
        </div>

        {step === 'email' && (
          <form onSubmit={handleRequestOtp}>
            <div className="mb-4">
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-700">
                Email address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="you@example.com"
                required
              />
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoading ? 'Sending...' : 'Continue with Email'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <div className="mb-4">
              <label htmlFor="otp" className="mb-2 block text-sm font-medium text-gray-700">
                Enter the 6-digit code sent to {email}
              </label>
              <input
                type="text"
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl tracking-widest focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="000000"
                maxLength={6}
                required
              />
              {devOtp && (
                <p className="mt-2 text-center text-sm text-gray-500">
                  Dev mode OTP: <span className="font-mono font-bold">{devOtp}</span>
                </p>
              )}
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              type="button"
              onClick={() => setStep('email')}
              className="mt-3 w-full text-sm text-gray-600 hover:text-gray-900"
            >
              Use a different email
            </button>
          </form>
        )}

        {step === 'whatsapp' && (
          <form onSubmit={handleLinkWhatsApp}>
            <div className="mb-4">
              <label htmlFor="whatsapp" className="mb-2 block text-sm font-medium text-gray-700">
                Link your WhatsApp number
              </label>
              <p className="mb-3 text-sm text-gray-500">
                Enter your WhatsApp number to receive task reminders
              </p>
              <input
                type="tel"
                id="whatsapp"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="+91 98765 43210"
                required
              />
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoading ? 'Linking...' : 'Link WhatsApp'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
