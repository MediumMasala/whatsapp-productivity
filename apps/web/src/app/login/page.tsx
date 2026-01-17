'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [devOtp, setDevOtp] = useState('');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await authApi.requestOtp(whatsappNumber);
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
      const response = await authApi.verifyOtp(whatsappNumber, otp);
      setAuth(response.token, response.user);
      router.push('/board');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Productivity</h1>
          <p className="mt-2 text-sm text-gray-600">Sign in with your WhatsApp number</p>
        </div>

        {step === 'phone' && (
          <form onSubmit={handleRequestOtp}>
            <div className="mb-4">
              <label htmlFor="whatsapp" className="mb-2 block text-sm font-medium text-gray-700">
                WhatsApp Number
              </label>
              <input
                type="tel"
                id="whatsapp"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                placeholder="+91 98765 43210"
                required
              />
              <p className="mt-2 text-xs text-gray-500">
                We&apos;ll send a 6-digit code to this number
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
            )}

            <button
              type="submit"
              disabled={isLoading || whatsappNumber.length < 10}
              className="w-full rounded-lg bg-green-600 py-3 font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoading ? 'Sending OTP...' : 'Send OTP via WhatsApp'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp}>
            <div className="mb-4">
              <label htmlFor="otp" className="mb-2 block text-sm font-medium text-gray-700">
                Enter the 6-digit code
              </label>
              <p className="mb-3 text-sm text-gray-500">
                We sent a code to <span className="font-medium">{whatsappNumber}</span>
              </p>
              <input
                type="text"
                id="otp"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-2xl tracking-widest focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20"
                placeholder="000000"
                maxLength={6}
                required
                autoFocus
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
              className="w-full rounded-lg bg-green-600 py-3 font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Verify & Sign In'}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setError('');
                setDevOtp('');
              }}
              className="mt-3 w-full text-sm text-gray-600 hover:text-gray-900"
            >
              Use a different number
            </button>
          </form>
        )}

        <div className="mt-6 border-t pt-4 text-center text-xs text-gray-500">
          By signing in, you agree to receive task reminders via WhatsApp
        </div>
      </div>
    </div>
  );
}
