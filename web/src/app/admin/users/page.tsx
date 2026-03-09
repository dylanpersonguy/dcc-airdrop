'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  Shield,
  Wallet,
  Lock,
  Filter,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface UserRow {
  id: string;
  telegramId: string;
  username: string | null;
  firstName: string | null;
  isAdmin: boolean;
  referralCode: string;
  walletAddress: string | null;
  referralCount: number;
  lockCount: number;
  purchaseCount: number;
  inviteCount: number;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const fetchUsers = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: '25',
      search,
      filter,
      sort,
      order,
    });
    try {
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setUsers(data.users);
      setPagination(data.pagination);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [search, filter, sort, order]);

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(1), 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const toggleSort = (field: string) => {
    if (sort === field) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setOrder('desc');
    }
  };

  const SortIndicator = ({ field }: { field: string }) => {
    if (sort !== field) return null;
    return <span className="ml-1 text-primary">{order === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <AdminShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search, filter, and inspect all platform users
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-6 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by username, name, Telegram ID, or referral code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-40">
                <option value="all">All Users</option>
                <option value="admin">Admins</option>
                <option value="hasWallet">Has Wallet</option>
                <option value="hasLocks">Has Active Locks</option>
                <option value="eligible">Eligible</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex h-48 items-center justify-center">
              <p className="text-sm text-muted-foreground">No users found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-14">#</TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort('username')} className="flex items-center hover:text-foreground transition-colors">
                        User<SortIndicator field="username" />
                      </button>
                    </TableHead>
                    <TableHead>Telegram ID</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead className="text-center">Refs</TableHead>
                    <TableHead className="text-center">Locks</TableHead>
                    <TableHead className="text-center">Buys</TableHead>
                    <TableHead>
                      <button onClick={() => toggleSort('createdAt')} className="flex items-center hover:text-foreground transition-colors">
                        Joined<SortIndicator field="createdAt" />
                      </button>
                    </TableHead>
                    <TableHead className="w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u, i) => (
                    <TableRow key={u.id}>
                      <TableCell className="text-muted-foreground text-xs">
                        {(pagination.page - 1) * pagination.limit + i + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-sm font-medium">
                              {u.username ? `@${u.username}` : u.firstName || 'Unknown'}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {u.referralCode}
                            </p>
                          </div>
                          {u.isAdmin && <Badge variant="warning">Admin</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {u.telegramId}
                      </TableCell>
                      <TableCell>
                        {u.walletAddress ? (
                          <span className="font-mono text-xs">
                            {u.walletAddress.slice(0, 6)}…{u.walletAddress.slice(-4)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{u.referralCount}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={u.lockCount > 0 ? 'success' : 'secondary'}>{u.lockCount}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{u.purchaseCount}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => router.push(`/admin/users/${u.id}`)}
                          className="h-7 w-7"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
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
                    onClick={() => fetchUsers(pagination.page - 1)}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagination.page >= pagination.totalPages}
                    onClick={() => fetchUsers(pagination.page + 1)}
                    className="h-7 px-2"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
