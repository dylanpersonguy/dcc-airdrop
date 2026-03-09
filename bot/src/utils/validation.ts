import { z } from 'zod';

/**
 * DecentralChain addresses are base58-encoded, typically 35 characters,
 * starting with '3D' (mainnet, chain ID 'D'). This regex is a practical guard.
 */
const DCC_ADDRESS_RE = /^3D[1-9A-HJ-NP-Za-km-z]{32,33}$/;

export const dccAddressSchema = z
  .string()
  .regex(DCC_ADDRESS_RE, 'Invalid DecentralChain address format');

export function isValidDccAddress(addr: string): boolean {
  return DCC_ADDRESS_RE.test(addr);
}

/** Referral codes: 10-char alphanumeric */
const REFERRAL_CODE_RE = /^[A-Za-z0-9]{6,20}$/;

export const referralCodeSchema = z
  .string()
  .regex(REFERRAL_CODE_RE, 'Invalid referral code format');

export function isValidReferralCode(code: string): boolean {
  return REFERRAL_CODE_RE.test(code);
}

/** Sanitize free-text input — strip control chars, limit length */
export function sanitize(input: string, maxLen = 256): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\x00-\x1f]/g, '').trim().slice(0, maxLen);
}

/** Escape Markdown V1 special characters for safe interpolation */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[\]])/g, '\\$1');
}
