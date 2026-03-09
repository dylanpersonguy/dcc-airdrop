'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  GitBranch,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  ArrowRight,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { AdminShell } from '@/components/admin-shell';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RefEvent = Record<string, any>;

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const statusVariant = (s: string) => {
  if (s === 'REWARDED' || s === 'ELIGIBLE') return 'success' as const;
  if (s === 'REJECTED') return 'destructive' as const;
  return 'warning' as const;
};

export default function AdminReferralsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<RefEvent[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [stats, setStats] = useState<{ tierCounts: Array<{ tier: number; count: number }>; statusCounts: Array<{ status: string; count: number }> }>({ tierCounts: [], statusCounts: [] });
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('');
  const [status, setStatus] = useState('');

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (tier) params.set('tier', tier);
    if (status) params.set('status', status);
    try {
      const res = await fetch(`/api/admin/referrals?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events);
        setPagination(data.pagination);
        setStats(data.stats);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [tier, status]);

  useEffect(() => { fetchData(1); }, [fetchData]);

  return (
    <AdminShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Referrals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Multi-tier referral network overview and event feed
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Referrals by Tier</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.tierCounts.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.tierCounts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(216 34% 17%)" />
                    <XAxis
                      dataKey="tier"
                      tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }}
                      tickFormatter={(v: number) => `Tier ${v}`}
                    />
                    <YAxis tick={{ fontSize: 11, fill: 'hsl(215 20% 55%)' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(224 71% 6%)', border: '1px solid hsl(216 34% 17%)', borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="count" name="Referrals" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Referrals by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.statusCounts.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.statusCounts}
                      dataKey="count"
                      nameKey="status"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      strokeWidth={2}
                      stroke="hsl(224 71% 4%)"
                    >
                      {stats.statusCounts.map((_: unknown, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {stats.statusCounts.map((s, i) => (
                <div key={s.status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {s.status}: {s.count}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-4 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={tier} onChange={(e) => setTier(e.target.value)} className="w-32 h-8 text-xs">
              <option value="">All Tiers</option>
              <option value="1">Tier 1</option>
              <option value="2">Tier 2</option>
              <option value="3">Tier 3</option>
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40 h-8 text-xs">
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="WALLET_CONNECTED">Wallet Connected</option>
              <option value="WALLET_VERIFIED">Wallet Verified</option>
              <option value="ELIGIBLE">Eligible</option>
              <option value="REWARDED">Rewarded</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead className="w-8 text-center"><ArrowRight className="h-3 w-3 mx-auto" /></TableHead>
                    <TableHead>Referred</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">No referral events</TableCell>
                    </TableRow>
                  ) : events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">
                        {e.referrer.username ? `@${e.referrer.username}` : e.referrer.firstName || e.referrer.telegramId}
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground">→</TableCell>
                      <TableCell className="text-sm">
                        {e.referred.username ? `@${e.referred.username}` : e.referred.firstName || e.referred.telegramId}
                      </TableCell>
                      <TableCell>
                        <Badge variant={e.tier === 1 ? 'default' : e.tier === 2 ? 'secondary' : 'outline'}>
                          T{e.tier}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{e.code}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(e.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push(`/admin/users/${e.referrer.userId}`)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pagination.total > 0 && (
                <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {(pagination.page - 1) * pagination.limit + 1}–
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => fetchData(pagination.page - 1)} className="h-7 px-2">
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground">{pagination.page} / {pagination.totalPages}</span>
                    <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => fetchData(pagination.page + 1)} className="h-7 px-2">
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
