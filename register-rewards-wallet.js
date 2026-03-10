/**
 * One-time script: Register the rewards wallet as an "allowed dApp"
 * on the EligibilityTracker contract so the bot can invoke
 * recordLpAdd, recordLpRemove, recordSwap, recordStake, recordUnstake.
 *
 * Usage:
 *   DEPLOYER_SEED="<admin seed>" node register-rewards-wallet.js
 *
 * The DEPLOYER_SEED must be the admin of the EligibilityTracker contract.
 * The rewards wallet seed is read from bot/.env (REWARDS_WALLET_SEED).
 */

const fs = require('fs');
const path = require('path');
const { invokeScript, broadcast, libs } = require('@waves/waves-transactions');
const { address } = libs.crypto;

const NODE_URL = process.env.DCC_NODE_URL || 'https://mainnet-node.decentralchain.io';
const DEPLOYER_SEED = process.env.DEPLOYER_SEED;
const CHAIN_ID = Number(process.env.DCC_CHAIN_ID) || 63;
const TRACKER_ADDRESS = process.env.ELIGIBILITY_TRACKER_ADDRESS || '3DWDW21LtCn1BnDos6yZNrxtiGWL9zPEkHv';

if (!DEPLOYER_SEED) {
  console.error('Error: DEPLOYER_SEED environment variable is required (admin seed phrase).');
  process.exit(1);
}

// Read rewards wallet seed from bot/.env
const envPath = path.join(__dirname, 'bot', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const match = envContent.match(/REWARDS_WALLET_SEED=(.+)/);
if (!match) {
  console.error('Error: REWARDS_WALLET_SEED not found in bot/.env');
  process.exit(1);
}
const REWARDS_WALLET_SEED = match[1].trim();
const REWARDS_WALLET_ADDRESS = address(REWARDS_WALLET_SEED, String.fromCharCode(CHAIN_ID));

console.log('Admin address:', address(DEPLOYER_SEED, String.fromCharCode(CHAIN_ID)));
console.log('Tracker contract:', TRACKER_ADDRESS);
console.log('Rewards wallet address:', REWARDS_WALLET_ADDRESS);

async function main() {
  // Check if already registered
  const checkUrl = `${NODE_URL}/addresses/data/${TRACKER_ADDRESS}/allowed:dapp:${REWARDS_WALLET_ADDRESS}`;
  try {
    const resp = await fetch(checkUrl);
    const data = await resp.json();
    if (data.value === true) {
      console.log('\n✅ Rewards wallet is already registered as an allowed dApp!');
      return;
    }
  } catch {
    // Key doesn't exist yet → proceed
  }

  console.log('\nRegistering rewards wallet as allowed dApp...');
  const tx = invokeScript({
    dApp: TRACKER_ADDRESS,
    call: {
      function: 'allowDapp',
      args: [{ type: 'string', value: REWARDS_WALLET_ADDRESS }],
    },
    payment: [],
    chainId: CHAIN_ID,
    fee: 900000,
  }, DEPLOYER_SEED);

  console.log('TX ID:', tx.id);
  const result = await broadcast(tx, NODE_URL);
  console.log('✅ Broadcast success! TX:', result.id);
  console.log('\nThe rewards wallet can now call recordLpAdd, recordSwap, etc. on the tracker.');
}

main().catch(err => {
  console.error('Failed:', err.message || err);
  process.exit(1);
});
