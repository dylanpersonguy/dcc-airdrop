'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, Wallet, Lock, Users, BarChart3, TrendingUp,
  LogOut, Copy, Check, ExternalLink, ShieldCheck, ShieldX, Shield,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface DashboardData {
  user: {
    id: string;
    telegramId: string;
    username: string | null;
    firstName: string | null;
    isAdmin: boolean;
    referralCode: string;
    createdAt: string;
  };
  wallet: { address: string; isVerified: boolean } | null;
  balance: {
    offChainAvailable: number;
    totalLocked: number;
    lockEarnings: number;
    lockEarningsUnredeemed: number;
    purchaseBalance: number;
    inviteBalance: number;
    depositBalance: number;
    commissions: number;
  };
  eligibility: {
    eligible: boolean;
    stDCCBalance: string;
    poolCount: number;
    swapCount: number;
    dappCount: number;
    hasCurrentLp: boolean;
    lpAgeBlocks: number;
    walletAgeOk: boolean;
    txCountOk: boolean;
    sybilFlag: boolean;
    claimed: boolean;
    rawScore: number | null;
    estimatedAllocation: number | null;
  } | null;
  locks: Array<{
    id: string;
    amount: number;
    dailyRate: number;
    startedAt: string;
    expiresAt: string;
    status: string;
    earnedDcc: number;
  }>;
  referrals: {
    total: number;
    byTier: number[];
    lockRate: number;
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function StatCard({
  title, value, sub, icon: Icon, color = 'blue',
}: {
  title: string; value: string; sub?: string; icon: React.ElementType; color?: string;
}) {
  const glowClass = color === 'green' ? 'glow-green' : color === 'purple' ? 'glow-purple' : 'glow-blue';
  const iconColor = color === 'green' ? 'text-green-400' : color === 'purple' ? 'text-purple-400' : 'text-blue-400';
  return (
    <Card className={glowClass}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => {
        if (r.status === 401) { router.push('/'); return null; }
        return r.json();
      })
      .then((d) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [router]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }, [router]);

  const copyReferral = useCallback(() => {
    if (!data) return;
    navigator.clipboard.writeText(`https://t.me/${process.env.NEXT_PUBLIC_BOT_USERNAME || 'DCCAirdrop_Bot'}?start=${data.user.referralCode}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Failed to load dashboard data.</p>
      </div>
    );
  }

  const { user, wallet, balance, eligibility, locks, referrals } = data;
  const totalBalance = balance.offChainAvailable + balance.totalLocked;

  // Eligibility score
  const eligChecks = eligibility
    ? [
        eligibility.walletAgeOk,
        eligibility.txCountOk,
        Number(eligibility.stDCCBalance) > 0,
        eligibility.poolCount > 0,
        eligibility.swapCount > 0,
        eligibility.dappCount > 0,
        eligibility.hasCurrentLp,
        eligibility.lpAgeBlocks > 0,
        !eligibility.sybilFlag,
        !eligibility.claimed,
      ]
    : [];
  const eligPassed = eligChecks.filter(Boolean).length;
  const eligTotal = eligChecks.length;
  const eligPct = eligTotal > 0 ? (eligPassed / eligTotal) * 100 : 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-bold text-lg">DCC Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user.firstName || user.username || 'User'}
            </span>
            {user.isAdmin && (
              <a
                href="/admin"
                className="text-xs bg-primary/20 text-primary px-2.5 py-1 rounded-full hover:bg-primary/30 transition-colors flex items-center gap-1"
              >
                <Shield className="h-3 w-3" />
                Admin Panel
              </a>
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fade-in">
          <StatCard
            title="Total Balance"
            value={`${fmt(totalBalance)} DCC`}
            sub={`${fmt(balance.offChainAvailable)} available`}
            icon={Wallet}
          />
          <StatCard
            title="Locked"
            value={`${fmt(balance.totalLocked)} DCC`}
            sub={`${locks.length} active lock${locks.length !== 1 ? 's' : ''}`}
            icon={Lock}
            color="green"
          />
          <StatCard
            title="Earnings"
            value={`${fmt(balance.lockEarnings)} DCC`}
            sub={`${referrals.lockRate}% daily rate`}
            icon={TrendingUp}
            color="green"
          />
          <StatCard
            title="Referrals"
            value={String(referrals.total)}
            sub={`T1: ${referrals.byTier[0]} · T2: ${referrals.byTier[1]} · T3: ${referrals.byTier[2]}`}
            icon={Users}
            color="purple"
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="overview" className="animate-fade-in">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="eligibility">Eligibility</TabsTrigger>
            <TabsTrigger value="locks">Locks</TabsTrigger>
            <TabsTrigger value="referrals">Referrals</TabsTrigger>
          </TabsList>

          {/* ── Overview Tab ── */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Wallet Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-primary" /> Wallet
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {wallet ? (
                    <>
                      <div className="flex items-center justify-between">
                        <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                          {wallet.address}
                        </code>
                        <a
                          href={`https://explorer.decentralchain.io/address/${wallet.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {wallet.isVerified ? (
                          <><ShieldCheck className="h-4 w-4 text-green-400" /> Verified</>
                        ) : (
                          <><ShieldX className="h-4 w-4 text-yellow-400" /> Not verified</>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No wallet connected. Use the Telegram bot to create one.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Balance Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" /> Balance Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 text-sm">
                    {[
                      ['Purchases', balance.purchaseBalance],
                      ['Invite Rewards', balance.inviteBalance],
                      ['Deposits', balance.depositBalance],
                      ['Lock Earnings', balance.lockEarningsUnredeemed],
                      ['Commissions', balance.commissions],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex justify-between">
                        <span className="text-muted-foreground">{label as string}</span>
                        <span className="font-medium">{fmt(val as number)} DCC</span>
                      </div>
                    ))}
                    <div className="border-t pt-3 flex justify-between font-semibold">
                      <span>Available</span>
                      <span className="text-primary">{fmt(balance.offChainAvailable)} DCC</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Eligibility Tab ── */}
          <TabsContent value="eligibility" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Airdrop Eligibility</CardTitle>
                    <CardDescription>
                      {eligibility
                        ? eligibility.eligible
                          ? '✅ You are eligible for the airdrop!'
                          : `${eligPassed}/${eligTotal} requirements met`
                        : 'No eligibility data. Run /start in the Telegram bot.'}
                    </CardDescription>
                  </div>
                  {eligibility && (
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {eligibility.estimatedAllocation
                          ? `${fmt(eligibility.estimatedAllocation)} DCC`
                          : '—'}
                      </div>
                      <p className="text-xs text-muted-foreground">Est. Allocation</p>
                    </div>
                  )}
                </div>
                {eligibility && (
                  <Progress value={eligPct} className="mt-4" />
                )}
              </CardHeader>
              {eligibility && (
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      ['Wallet Age', eligibility.walletAgeOk],
                      ['Transaction Count', eligibility.txCountOk],
                      ['stDCC Balance', Number(eligibility.stDCCBalance) > 0],
                      ['Pool Participation', eligibility.poolCount > 0],
                      ['Swap Activity', eligibility.swapCount > 0],
                      ['dApp Interactions', eligibility.dappCount > 0],
                      ['Active LP', eligibility.hasCurrentLp],
                      ['LP Maturity', eligibility.lpAgeBlocks > 0],
                      ['Sybil Check', !eligibility.sybilFlag],
                      ['Not Claimed', !eligibility.claimed],
                    ].map(([label, passed]) => (
                      <div
                        key={label as string}
                        className={`flex items-center gap-3 rounded-lg border p-3 ${
                          passed ? 'border-green-500/30 bg-green-500/5' : 'border-border'
                        }`}
                      >
                        <span className="text-lg">{passed ? '✅' : '⬜'}</span>
                        <span className="text-sm">{label as string}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>

          {/* ── Locks Tab ── */}
          <TabsContent value="locks" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-green-400" /> Active Locks
                </CardTitle>
                <CardDescription>
                  {locks.length
                    ? `${locks.length} active lock${locks.length > 1 ? 's' : ''} · ${referrals.lockRate}% daily rate`
                    : 'No active locks. Use /lock in the Telegram bot to start earning.'}
                </CardDescription>
              </CardHeader>
              {locks.length > 0 && (
                <CardContent>
                  <div className="space-y-4">
                    {locks.map((lock) => {
                      const start = new Date(lock.startedAt);
                      const end = new Date(lock.expiresAt);
                      const now = new Date();
                      const totalMs = end.getTime() - start.getTime();
                      const elapsedMs = now.getTime() - start.getTime();
                      const pct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
                      const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
                      return (
                        <div key={lock.id} className="rounded-lg border p-4 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold">{fmt(lock.amount)} DCC</div>
                              <div className="text-xs text-muted-foreground">
                                {lock.dailyRate}% daily · {daysLeft} days remaining
                              </div>
                            </div>
                            <span className="text-sm font-medium text-green-400">
                              +{fmt(lock.earnedDcc)} DCC earned
                            </span>
                          </div>
                          <Progress value={pct} />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{start.toLocaleDateString()}</span>
                            <span>{end.toLocaleDateString()}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          </TabsContent>

          {/* ── Referrals Tab ── */}
          <TabsContent value="referrals" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Referral Link */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-400" /> Your Referral Link
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
                      t.me/{process.env.NEXT_PUBLIC_BOT_USERNAME || 'DCCAirdrop_Bot'}?start={user.referralCode}
                    </code>
                    <Button variant="outline" size="icon" onClick={copyReferral}>
                      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Share this link to earn DCC rewards through the 3-tier referral system.
                  </p>
                </CardContent>
              </Card>

              {/* Referral Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Referral Network</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {['Tier 1 (Direct)', 'Tier 2', 'Tier 3'].map((label, i) => (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium">{referrals.byTier[i]}</span>
                        </div>
                        <Progress
                          value={
                            referrals.total > 0
                              ? (referrals.byTier[i] / Math.max(1, referrals.byTier[0])) * 100
                              : 0
                          }
                        />
                      </div>
                    ))}
                    <div className="border-t pt-4 flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Referrals</span>
                      <span className="font-bold text-purple-400">{referrals.total}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Lock Rate Boost</span>
                      <span className="font-bold text-green-400">{referrals.lockRate}%/day</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
