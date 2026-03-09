// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Transfer Service — Send DCC from rewards wallet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { transfer, broadcast } from '@waves/waves-transactions';
import { address as deriveAddress } from '@waves/ts-lib-crypto';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { getWalletBalances } from '../blockchain';
import { DCC_CHAIN_ID, FEE_WAVELETS, WAVELETS_PER_DCC } from '../../config/constants';

const CHAIN_ID = DCC_CHAIN_ID;

/**
 * Get the rewards wallet's on-chain DCC balance.
 */
export async function getRewardsWalletBalance(): Promise<number> {
  const addr = deriveAddress(config.REWARDS_WALLET_SEED, String.fromCharCode(CHAIN_ID));
  const balances = await getWalletBalances(addr);
  return Number(balances.dccBalance) / WAVELETS_PER_DCC;
}

/**
 * Send DCC from the rewards wallet to a recipient address.
 * Amount is in whole DCC (1 DCC = 100_000_000 wavelets).
 * Returns the transaction ID.
 */
export async function sendDCC(recipientAddress: string, amountDCC: number): Promise<string> {
  const amountWavelets = Math.round(amountDCC * WAVELETS_PER_DCC);

  const tx = transfer({
    recipient: recipientAddress,
    amount: amountWavelets,
    fee: FEE_WAVELETS,
    chainId: CHAIN_ID,
  }, config.REWARDS_WALLET_SEED);

  logger.info(
    { txId: tx.id, recipient: recipientAddress, amount: amountDCC },
    'Broadcasting DCC transfer',
  );

  const result = await broadcast(tx, config.DCC_NODE_URL);
  return result.id;
}

/**
 * Send DCC from the user's wallet to a recipient address.
 * The caller must provide the user's decrypted seed phrase.
 * Amount is in whole DCC. Returns the transaction ID.
 */
export async function sendDCCFromWallet(
  seed: string,
  recipientAddress: string,
  amountDCC: number,
): Promise<string> {
  const amountWavelets = Math.round(amountDCC * WAVELETS_PER_DCC);

  const tx = transfer({
    recipient: recipientAddress,
    amount: amountWavelets,
    fee: FEE_WAVELETS,
    chainId: CHAIN_ID,
  }, seed);

  logger.info(
    { txId: tx.id, recipient: recipientAddress, amount: amountDCC },
    'Broadcasting DCC transfer from user wallet',
  );

  const result = await broadcast(tx, config.DCC_NODE_URL);
  return result.id;
}
