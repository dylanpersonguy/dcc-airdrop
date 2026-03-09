import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/');

  const user = await prisma.user.findUnique({
    where: { telegramId: BigInt(session.telegramId) },
    select: { isAdmin: true },
  });

  if (!user?.isAdmin) redirect('/dashboard');

  return <>{children}</>;
}
