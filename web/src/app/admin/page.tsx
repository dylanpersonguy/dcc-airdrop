'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  Wallet,
  Lock,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  GitBranch,
  DollarSign,
  ShieldCheck,
  Activity,
  Zap,
  Award,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminShell } from '@/components/admin-shell';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface AdminStats {
  overview: {
    totalUsers: number;
    newUsersToday: number;
    newUsersWeek: number;
    newUsersMonth: number;
    totalWallets: number;
    verifiedWallets: number;
    eligibleCount: number;
    claimedCount: number;
  };
  finance: {
    totalLockedDcc: number;
    totalLockEarnings: number;
    totalLocks: number;
    activeLockCount: number;
    completedLockCount: number;
    totalPurchaseDcc: number;
    totalPurchaseCount: number;
    totalDepositDcc: number;
    totalDepositCount: number;
    totalInviteRewards: number;
    totalInviteRewardCount: number;
    totalLockCommissions: number;
    totalLockCommissionCount: number;
    totalReferralRewards: number;
    totalReferralRewardCount: number;
  };
  referrals: {
    total: number;
    tier1: number;
    tier2: number;
    tier3: number;
  };
  charts: {
    dailySignups: Array<{ date: string; count: number }>;
    dailyPurchases: Array<{ date: string; totalDcc: number; count: number }>;
    dailyLocks: Array<{ date: string; totalAmount: number; count: number }>;
    purchasesByStatus: Array<{ status: string; count: number }>;
    locksByStatus: Array<{ status: string; count: number }>;
  };
  leaderboards: {
    topReferrers: Array<{ userId: string; username: string | null; firstName: string | null; count: number }>;
    topLockers: Array<{ userId: string; username: string | null; firstName: string | null; totalLocked: number }>;
  };
  recentAuditLogs: Array<{
    id: string;
    actorType: string;
    actorName: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    createdAt: string;
  }>;
}

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendLabel,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: number;
  trendLabel?: string;
  color?: 'blue' | 'green' | 'purple' | 'amber' | 'rose';
}) {
  const colorMap = {
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-emerald-400 bg-emerald-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
    rose: 'text-rose-400 bg-rose-500/10',
  };
  return (
    <Card className="border-border/50">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{typeof value === 'number' ? value.toLocaleString() : value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            {trend !== undefined && (
              <div className="flex items-center gap-1">
                {trend >= 0 ? (
                  <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                ) : (
                  <ArrowDownRight className="h-3 w-3 text-rose-400" />
                )}
                <span className={`text-xs font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {trend >= 0 ? '+' : ''}{trend}
                </span>
                {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
              </div>
            )}
          </div>
          <div className={`rounded-lg p-2.5 ${colorMap[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartTooltipContent({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-card p-3 shadow-xl">
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? 'Access denied' : 'Failed to load');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <AdminShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading analytics…</p>
          </div>
        </div>
      </AdminShell>
    );
  }

  if (error || !data) {
    return (
      <AdminShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-destructive">{error || 'Failed to load data'}</p>
        </div>
      </AdminShell>
    );
  }

  const { overview, finance, referrals, charts, leaderboards, recentAuditLogs } = data;

  return (
    <AdminShell>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Analytics Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time overview of the DecentralChain airdrop platform
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Total Users"
          value={overview.totalUsers}
          trend={overview.newUsersToday}
          trendLabel="today"
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Verified Wallets"
          value={overview.verifiedWallets}
          subtitle={`${overview.totalWallets} total wallets`}
          icon={Wallet}
          color="green"
        />
        <StatCard
          title="Total Locked"
          value={`${finance.totalLockedDcc.toLocaleString()} DCC`}
          subtitle={`${finance.activeLockCount} active locks`}
          icon={Lock}
          color="purple"
        />
        <StatCard
          title="Total Purchased"
          value={`${finance.totalPurchaseDcc.toLocaleString()} DCC`}
          subtitle={`${finance.totalPurchaseCount} purchases`}
          icon={DollarSign}
          color="amber"
        />
      </div>

      {/* Second row KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Eligible Users"
          value={overview.eligibleCount}
          subtitle={`${overview.claimedCount} claimed`}
          icon={ShieldCheck}
          color="green"
        />
        <StatCard
          title="Total Referrals"
          value={referrals.total}
          subtitle={`T1: ${referrals.tier1} · T2: ${referrals.tier2} · T3: ${referrals.tier3}`}
          icon={GitBranch}
          color="blue"
        />
        <StatCard
          title="Lock Earnings"
          value={`${finance.totalLockEarnings.toLocaleString()} DCC`}
          subtitle={`${finance.totalLockCommissions.toLocaleString()} DCC in commissions`}
          icon={TrendingUp}
          color="purple"
        />
        <StatCard
          title="Invite Rewards"
          value={`${finance.totalInviteRewards.toLocaleString()} DCC`}
          subtitle={`${finance.totalInviteRewardCount} rewards issued`}
          icon={Award}
          color="rose"
        />
      </div>

      {/* Charts Section */}
      <Tabs defaultValue="growth" className="mb-8">
        <TabsList>
          <TabsTrigger value="growth">User Growth</TabsTrigger>
          <TabsTrigger value="purchases">Purchase Volume</TabsTrigger>
          <TabsTrigger value="locks">Lock Volume</TabsTrigger>
        </TabsList>

        <TabsContent value="growth">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Daily New Users (30 Days)</CardTitle>
              <CardDescription>
                {overview.newUsersWeek} new this week · {overview.newUsersMonth} new this month
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={charts.dailySignups}>
                    <defs>
                      <linearGradient id="signupGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 34% 17%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="New Users"
                      stroke="#3b82f6"
                      fill="url(#signupGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Daily Purchase Volume (30 Days)</CardTitle>
              <CardDescription>DCC purchased through bridge</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.dailyPurchases}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 34% 17%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="totalDcc" name="DCC Purchased" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locks">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Daily Lock Volume (30 Days)</CardTitle>
              <CardDescription>DCC locked by users</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={charts.dailyLocks}>
                    <defs>
                      <linearGradient id="lockGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 34% 17%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="totalAmount"
                      name="DCC Locked"
                      stroke="#8b5cf6"
                      fill="url(#lockGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Bottom grid: Pie charts + Leaderboards + Audit */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-8">
        {/* Status breakdowns */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Status Breakdown</CardTitle>
            <CardDescription>Purchases & Locks by status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Purchases</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts.purchasesByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      strokeWidth={2}
                      stroke="hsl(224 71% 4%)"
                    >
                      {charts.purchasesByStatus.map((_: unknown, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Locks</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={charts.locksByStatus}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      strokeWidth={2}
                      stroke="hsl(224 71% 4%)"
                    >
                      {charts.locksByStatus.map((_: unknown, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboards */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Leaderboards</CardTitle>
            <CardDescription>Top performers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Top Referrers</p>
              <div className="space-y-2">
                {leaderboards.topReferrers.slice(0, 5).map((r, i) => (
                  <div key={r.userId} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate max-w-[120px]">
                        {r.username ? `@${r.username}` : r.firstName || 'Unknown'}
                      </span>
                    </div>
                    <Badge variant="secondary">{r.count} refs</Badge>
                  </div>
                ))}
                {leaderboards.topReferrers.length === 0 && (
                  <p className="text-xs text-muted-foreground">No referrals yet</p>
                )}
              </div>
            </div>
            <div>
              <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Top Lockers</p>
              <div className="space-y-2">
                {leaderboards.topLockers.slice(0, 5).map((r, i) => (
                  <div key={r.userId} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/10 text-[10px] font-bold text-purple-400">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate max-w-[120px]">
                        {r.username ? `@${r.username}` : r.firstName || 'Unknown'}
                      </span>
                    </div>
                    <Badge variant="secondary">{r.totalLocked.toLocaleString()} DCC</Badge>
                  </div>
                ))}
                {leaderboards.topLockers.length === 0 && (
                  <p className="text-xs text-muted-foreground">No locks yet</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <CardDescription>Latest audit log entries</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentAuditLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="flex items-start gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
                  <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium leading-tight">
                      <span className="text-foreground">{log.actorName || log.actorType}</span>
                      {' '}
                      <span className="text-muted-foreground">{log.action}</span>
                      {log.targetType && (
                        <span className="text-muted-foreground">
                          {' '}→ {log.targetType}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {recentAuditLogs.length === 0 && (
                <p className="text-xs text-muted-foreground">No activity recorded yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Summary Table */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Financial Summary</CardTitle>
          <CardDescription>Aggregated DCC flows across all channels</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Locked', value: finance.totalLockedDcc, count: finance.totalLocks },
              { label: 'Earnings', value: finance.totalLockEarnings, count: finance.activeLockCount },
              { label: 'Purchased', value: finance.totalPurchaseDcc, count: finance.totalPurchaseCount },
              { label: 'Deposited', value: finance.totalDepositDcc, count: finance.totalDepositCount },
              { label: 'Invite Rewards', value: finance.totalInviteRewards, count: finance.totalInviteRewardCount },
              { label: 'Commissions', value: finance.totalLockCommissions, count: finance.totalLockCommissionCount },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border/50 bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="mt-1 text-lg font-bold">{item.value.toLocaleString()}</p>
                <p className="text-[10px] text-muted-foreground">{item.count} records</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AdminShell>
  );
}
