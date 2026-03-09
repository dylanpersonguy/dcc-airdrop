'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Lock,
  DollarSign,
  Upload,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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
type Item = Record<string, any>;

function PaginationBar({
  pagination,
  onPage,
}: {
  pagination: Pagination;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Showing {(pagination.page - 1) * pagination.limit + 1}–
        {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.page <= 1}
          onClick={() => onPage(pagination.page - 1)}
          className="h-7 px-2"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground">
          {pagination.page} / {pagination.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onPage(pagination.page + 1)}
          className="h-7 px-2"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function LocksTab() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const fetch_ = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ tab: 'locks', page: String(page), limit: '25' });
    if (status) params.set('status', status);
    const res = await fetch(`/api/admin/finance?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setPagination(data.pagination);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { fetch_(1); }, [fetch_]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">All Locks</CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36 h-8 text-xs">
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="WITHDRAWN">Withdrawn</option>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Earned</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">
                      {l.username ? `@${l.username}` : l.firstName || l.telegramId}
                    </TableCell>
                    <TableCell className="font-medium">{l.amount.toLocaleString()} DCC</TableCell>
                    <TableCell>{(l.dailyRate * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-emerald-400">{l.earnedDcc.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === 'ACTIVE' ? 'success' : l.status === 'COMPLETED' ? 'default' : 'destructive'}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(l.startedAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(l.expiresAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push(`/admin/users/${l.userId}`)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {pagination.total > 0 && <PaginationBar pagination={pagination} onPage={fetch_} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PurchasesTab() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const fetch_ = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ tab: 'purchases', page: String(page), limit: '25' });
    if (status) params.set('status', status);
    const res = await fetch(`/api/admin/finance?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setPagination(data.pagination);
    }
    setLoading(false);
  }, [status]);

  useEffect(() => { fetch_(1); }, [fetch_]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">All Purchases</CardTitle>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36 h-8 text-xs">
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="DEPOSITED">Deposited</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="EXPIRED">Expired</option>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>DCC</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Redeemed</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">
                      {p.username ? `@${p.username}` : p.firstName || p.telegramId}
                    </TableCell>
                    <TableCell><Badge variant="outline">{p.token}</Badge></TableCell>
                    <TableCell>{p.amountPaid}</TableCell>
                    <TableCell className="font-medium">{p.dccAmount.toLocaleString()} DCC</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'COMPLETED' ? 'success' : p.status === 'FAILED' ? 'destructive' : 'warning'}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.redeemed ? <Badge variant="success">Yes</Badge> : <Badge variant="secondary">No</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push(`/admin/users/${p.userId}`)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {pagination.total > 0 && <PaginationBar pagination={pagination} onPage={fetch_} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DepositsTab() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ tab: 'deposits', page: String(page), limit: '25' });
    const res = await fetch(`/api/admin/finance?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setPagination(data.pagination);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(1); }, [fetch_]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">All Deposits</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>TX ID</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">
                      {d.username ? `@${d.username}` : d.firstName || d.telegramId}
                    </TableCell>
                    <TableCell className="font-medium">{d.amount.toLocaleString()} DCC</TableCell>
                    <TableCell className="font-mono text-xs max-w-[120px] truncate">{d.txId}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {d.senderAddress.slice(0, 6)}…{d.senderAddress.slice(-4)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="success">{d.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.push(`/admin/users/${d.userId}`)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {pagination.total > 0 && <PaginationBar pagination={pagination} onPage={fetch_} />}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminFinancePage() {
  return (
    <AdminShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Finance & Locks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage all DCC locks, purchases, and on-chain deposits
        </p>
      </div>

      <Tabs defaultValue="locks">
        <TabsList className="mb-4">
          <TabsTrigger value="locks"><Lock className="mr-1.5 h-3.5 w-3.5" /> Locks</TabsTrigger>
          <TabsTrigger value="purchases"><DollarSign className="mr-1.5 h-3.5 w-3.5" /> Purchases</TabsTrigger>
          <TabsTrigger value="deposits"><Upload className="mr-1.5 h-3.5 w-3.5" /> Deposits</TabsTrigger>
        </TabsList>

        <TabsContent value="locks"><LocksTab /></TabsContent>
        <TabsContent value="purchases"><PurchasesTab /></TabsContent>
        <TabsContent value="deposits"><DepositsTab /></TabsContent>
      </Tabs>
    </AdminShell>
  );
}
