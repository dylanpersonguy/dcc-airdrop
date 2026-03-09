'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  ScrollText,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Activity,
  Bot,
  Shield,
  User,
  Settings,
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

interface AuditEntry {
  id: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorTelegramId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const actorIcon = (type: string) => {
  switch (type) {
    case 'admin': return <Shield className="h-3.5 w-3.5 text-amber-400" />;
    case 'bot': return <Bot className="h-3.5 w-3.5 text-blue-400" />;
    case 'system': return <Settings className="h-3.5 w-3.5 text-purple-400" />;
    default: return <User className="h-3.5 w-3.5 text-muted-foreground" />;
  }
};

const actorBadgeVariant = (type: string) => {
  switch (type) {
    case 'admin': return 'warning' as const;
    case 'bot': return 'default' as const;
    case 'system': return 'secondary' as const;
    default: return 'outline' as const;
  }
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [actorType, setActorType] = useState('');

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '50' });
    if (actionFilter) params.set('action', actionFilter);
    if (actorType) params.set('actorType', actorType);
    try {
      const res = await fetch(`/api/admin/audit?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setPagination(data.pagination);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [actionFilter, actorType]);

  useEffect(() => {
    const timer = setTimeout(() => fetchLogs(1), 300);
    return () => clearTimeout(timer);
  }, [fetchLogs]);

  return (
    <AdminShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete trail of all platform actions and events
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-4 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter by action name…"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={actorType} onChange={(e) => setActorType(e.target.value)} className="w-36">
                <option value="">All Actors</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="bot">Bot</option>
                <option value="system">System</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Log Table */}
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
                    <TableHead>Time</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No audit entries found
                      </TableCell>
                    </TableRow>
                  ) : logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {actorIcon(log.actorType)}
                          <div>
                            <p className="text-xs font-medium">{log.actorName || log.actorId || 'system'}</p>
                            <Badge variant={actorBadgeVariant(log.actorType)} className="mt-0.5 text-[9px]">
                              {log.actorType}
                            </Badge>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                          {log.action}
                        </code>
                      </TableCell>
                      <TableCell>
                        {log.targetType ? (
                          <div className="text-xs">
                            <span className="text-muted-foreground">{log.targetType}:</span>{' '}
                            <span className="font-mono text-[10px]">{log.targetId?.slice(0, 12)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {log.metadata ? (
                          <code className="block truncate rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {JSON.stringify(log.metadata)}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination.total > 0 && (
                <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {(pagination.page - 1) * pagination.limit + 1}–
                    {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchLogs(pagination.page - 1)}
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
                      onClick={() => fetchLogs(pagination.page + 1)}
                      className="h-7 px-2"
                    >
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
