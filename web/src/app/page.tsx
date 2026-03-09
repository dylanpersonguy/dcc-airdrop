'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TelegramLogin, type TelegramAuthData } from '@/components/telegram-login';
import { Zap } from 'lucide-react';

interface DevUser {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [devUsers, setDevUsers] = useState<DevUser[]>([]);
  const botName = process.env.NEXT_PUBLIC_BOT_USERNAME || 'DCCAirdrop_Bot';

  // Detect localhost and fetch dev users
  useEffect(() => {
    const isLocalhost = typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (isLocalhost) {
      setIsDev(true);
      fetch('/api/auth/dev')
        .then((r) => (r.ok ? r.json() : []))
        .then((users: DevUser[]) => setDevUsers(users))
        .catch(() => {});
    }
  }, []);

  const handleAuth = useCallback(async (user: TelegramAuthData) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Authentication failed');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleDevLogin = useCallback(async (telegramId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Dev login failed');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        {/* Logo & Title */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 glow-blue">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">DCC Dashboard</h1>
          <p className="text-muted-foreground">
            Connect with Telegram to view your airdrop eligibility, balances, locks, and referrals.
          </p>
        </div>

        {/* Login Widget */}
        <div className="rounded-xl border bg-card p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold">Sign In</h2>
            <p className="text-sm text-muted-foreground">
              Use your Telegram account to continue
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <TelegramLogin botName={botName} onAuth={handleAuth} />
          )}

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
        </div>

        {/* Dev Login — only on localhost */}
        {isDev && devUsers.length > 0 && (
          <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6 space-y-4">
            <div className="text-center space-y-1">
              <h3 className="text-sm font-semibold text-yellow-400">Dev Login</h3>
              <p className="text-xs text-muted-foreground">
                Quick login as an existing user (localhost only)
              </p>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {devUsers.map((u) => (
                <button
                  key={u.telegramId}
                  onClick={() => handleDevLogin(u.telegramId)}
                  disabled={loading}
                  className="w-full flex items-center justify-between rounded-lg border px-4 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <span>
                    {u.username ? `@${u.username}` : u.firstName || 'User'}
                    {u.isAdmin && (
                      <span className="ml-2 text-xs text-yellow-400 font-medium">ADMIN</span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">{u.telegramId}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Features */}
        <div className="grid grid-cols-2 gap-3 text-center text-sm text-muted-foreground">
          <div className="rounded-lg border p-3">
            <div className="text-lg mb-1">📊</div>
            Eligibility Status
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-lg mb-1">💰</div>
            Balance Overview
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-lg mb-1">🔒</div>
            Lock & Earn
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-lg mb-1">👥</div>
            Referral Network
          </div>
        </div>
      </div>
    </div>
  );
}
