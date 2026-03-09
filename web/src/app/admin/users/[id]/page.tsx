'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Wallet,
  Lock,
  GitBranch,
  DollarSign,
  Gift,
  ShieldCheck,
  ShieldX,
  Upload,
  Award,
  ScrollText,
  Copy,
  Check,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UserDetail = Record<string, any>;

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/users/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <AdminShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AdminShell>
    );
  }

  if (!user) {
    return (
      <AdminShell>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
          <p className="text-destructive">User not found</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/admin/users')}>
            <ArrowLeft className="mr-2 h-3.5 w-3.5" /> Back to Users
          </Button>
        </div>
      </AdminShell>
    );
  }

  const wallets = user.wallets || [];
  const eligibility = user.eligibilitySnapshots?.[0] || null;
  const referrals = user.referralsMade || [];
  const purchases = user.dccPurchases || [];
  const locks = user.dccLocks || [];
  const deposits = user.dccDeposits || [];
  const inviteRewards = user.inviteRewards || [];
  const lockRewards = user.lockReferralRewards || [];
  const auditLogs = user.auditLogs || [];

  return (
    <AdminShell>
      {/* Breadcrumb */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push('/admin/users')}
        className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Users
      </Button>

      {/* User header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {user.username ? `@${user.username}` : user.firstName || 'Unknown User'}
            </h1>
            {user.isAdmin && <Badge variant="warning">Admin</Badge>}
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
            <span>TG ID: {user.telegramId}</span>
            <span>•</span>
            <span>Joined {new Date(user.createdAt).toLocaleDateString()}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              Code: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{user.referralCode}</code>
              <button onClick={() => copyToClipboard(user.referralCode)} className="text-muted-foreground hover:text-foreground">
                {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              </button>
            </span>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Wallets</p>
            <p className="mt-1 text-xl font-bold">{wallets.length}</p>
            <p className="text-[10px] text-muted-foreground">
              {wallets.filter((w: UserDetail) => w.isVerified).length} verified
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Locks</p>
            <p className="mt-1 text-xl font-bold">{locks.length}</p>
            <p className="text-[10px] text-muted-foreground">
              {locks.filter((l: UserDetail) => l.status === 'ACTIVE').length} active
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Referrals</p>
            <p className="mt-1 text-xl font-bold">{referrals.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Purchases</p>
            <p className="mt-1 text-xl font-bold">{purchases.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="wallets">
        <TabsList className="mb-4">
          <TabsTrigger value="wallets"><Wallet className="mr-1.5 h-3.5 w-3.5" /> Wallets</TabsTrigger>
          <TabsTrigger value="eligibility"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Eligibility</TabsTrigger>
          <TabsTrigger value="locks"><Lock className="mr-1.5 h-3.5 w-3.5" /> Locks</TabsTrigger>
          <TabsTrigger value="purchases"><DollarSign className="mr-1.5 h-3.5 w-3.5" /> Purchases</TabsTrigger>
          <TabsTrigger value="referrals"><GitBranch className="mr-1.5 h-3.5 w-3.5" /> Referrals</TabsTrigger>
          <TabsTrigger value="activity"><ScrollText className="mr-1.5 h-3.5 w-3.5" /> Activity</TabsTrigger>
        </TabsList>

        {/* Wallets */}
        <TabsContent value="wallets">
          <Card className="border-border/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Address</TableHead>
                    <TableHead>Verified</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Verified At</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallets.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No wallets</TableCell></TableRow>
                  ) : wallets.map((w: UserDetail) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-mono text-xs">{w.address}</TableCell>
                      <TableCell>
                        {w.isVerified ? (
                          <Badge variant="success">Verified</Badge>
                        ) : (
                          <Badge variant="destructive">Unverified</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{w.verificationMethod || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {w.verifiedAt ? new Date(w.verifiedAt).toLocaleDateString() : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(w.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Eligibility */}
        <TabsContent value="eligibility">
          <Card className="border-border/50">
            <CardContent className="p-6">
              {eligibility ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    {eligibility.eligible ? (
                      <Badge variant="success" className="text-sm px-3 py-1"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> Eligible</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-sm px-3 py-1"><ShieldX className="mr-1 h-3.5 w-3.5" /> Not Eligible</Badge>
                    )}
                    {eligibility.claimed && <Badge variant="warning">Claimed</Badge>}
                    {eligibility.sybilFlag && <Badge variant="destructive">Sybil Flagged</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {[
                      { label: 'Raw Score', value: eligibility.rawScore?.toFixed(2) || '—' },
                      { label: 'Est. Allocation', value: eligibility.estimatedAllocation?.toFixed(2) || '—' },
                      { label: 'stDCC Balance', value: eligibility.stDCCBalance },
                      { label: 'Pool Count', value: eligibility.poolCount },
                      { label: 'Swap Count', value: eligibility.swapCount },
                      { label: 'Dapp Count', value: eligibility.dappCount },
                      { label: 'LP Age (blocks)', value: eligibility.lpAgeBlocks },
                      { label: 'Has Current LP', value: eligibility.hasCurrentLp ? 'Yes' : 'No' },
                      { label: 'Wallet Age OK', value: eligibility.walletAgeOk ? 'Yes' : 'No' },
                      { label: 'TX Count OK', value: eligibility.txCountOk ? 'Yes' : 'No' },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                        <p className="text-[10px] text-muted-foreground">{item.label}</p>
                        <p className="mt-0.5 text-sm font-medium">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Snapshot taken: {new Date(eligibility.createdAt).toLocaleString()}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No eligibility snapshot</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Locks */}
        <TabsContent value="locks">
          <Card className="border-border/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Earned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Expires</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locks.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No locks</TableCell></TableRow>
                  ) : locks.map((l: UserDetail) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.amount.toLocaleString()} DCC</TableCell>
                      <TableCell>{(l.dailyRate * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-emerald-400">{l.earnedDcc.toLocaleString()} DCC</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            l.status === 'ACTIVE' ? 'success' : l.status === 'COMPLETED' ? 'default' : 'destructive'
                          }
                        >
                          {l.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(l.startedAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(l.expiresAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Purchases */}
        <TabsContent value="purchases">
          <Card className="border-border/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Token</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>DCC</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Redeemed</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No purchases</TableCell></TableRow>
                  ) : purchases.map((p: UserDetail) => (
                    <TableRow key={p.id}>
                      <TableCell><Badge variant="outline">{p.token}</Badge></TableCell>
                      <TableCell>{p.amountPaid}</TableCell>
                      <TableCell className="font-medium">{p.dccAmount.toLocaleString()} DCC</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            p.status === 'COMPLETED' ? 'success' : p.status === 'FAILED' ? 'destructive' : 'warning'
                          }
                        >
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {p.redeemed ? <Badge variant="success">Yes</Badge> : <Badge variant="secondary">No</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Referrals */}
        <TabsContent value="referrals">
          <Card className="border-border/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referred User</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No referrals</TableCell></TableRow>
                  ) : referrals.map((r: UserDetail) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        {r.referredUser?.username
                          ? `@${r.referredUser.username}`
                          : r.referredUser?.firstName || r.referredUserId}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.tier === 1 ? 'default' : r.tier === 2 ? 'secondary' : 'outline'}>
                          Tier {r.tier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === 'REWARDED' ? 'success' :
                            r.status === 'REJECTED' ? 'destructive' :
                            'warning'
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity */}
        <TabsContent value="activity">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-base">Recent Actions</CardTitle>
              <CardDescription>Audit log trail for this user</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {auditLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity recorded</p>
                ) : auditLogs.map((log: UserDetail) => (
                  <div key={log.id} className="flex items-start gap-3 rounded-lg bg-muted/30 px-3 py-2.5">
                    <ScrollText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">
                        <span className="text-primary">{log.action}</span>
                        {log.targetType && (
                          <span className="text-muted-foreground"> → {log.targetType} {log.targetId}</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AdminShell>
  );
}
