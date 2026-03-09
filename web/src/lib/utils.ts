import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const WAVELETS_PER_DCC = 100_000_000;

export function formatDcc(wavelets: bigint | number | string): string {
  const n = Number(wavelets) / WAVELETS_PER_DCC;
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function shortAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
