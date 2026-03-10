/**
 * Usage: DEPLOYER_SEED="your seed phrase" node allow-dapps.js
 */
const { invokeScript, broadcast, libs } = require('@waves/waves-transactions');
const { address } = libs.crypto;

const SEED = process.env.DEPLOYER_SEED;
const NODE_URL = process.env.DCC_NODE_URL || 'https://mainnet-node.decentralchain.io';
const CHAIN_ID = Number(process.env.DCC_CHAIN_ID) || 63;
const TRACKER = process.env.ELIGIBILITY_TRACKER_ADDRESS || '3DWDW21LtCn1BnDos6yZNrxtiGWL9zPEkHv';

if (!SEED) {
  console.error('Error: DEPLOYER_SEED environment variable is required.');
  console.error('Usage: DEPLOYER_SEED="your seed phrase" node allow-dapps.js');
  process.exit(1);
}

async function allowDapp(dappAddr) {
  console.log('allowDapp("' + dappAddr + '")...');
  const tx = invokeScript({
    dApp: TRACKER,
    call: { function: 'allowDapp', args: [{ type: 'string', value: dappAddr }] },
    payment: [],
    chainId: CHAIN_ID,
    fee: 900000,
  }, SEED);
  console.log('TX ID:', tx.id);
  const result = await broadcast(tx, NODE_URL);
  console.log('Success:', result.id);
  return result;
}

(async () => {
  // Allow PoolCore
  await allowDapp('3Dfh97WETii2jqHUZfw6AGsn3dLkAmvfiFm');
  // Small delay between txs
  await new Promise(r => setTimeout(r, 3000));
  // Allow SwapRouter
  await allowDapp('3DfCh3DHDRNpVC25N6vGxpMcFDrgAui6F5n');
  console.log('\nBoth dApps allowed on EligibilityTracker!');
})().catch(e => {
  console.error('Failed:', e.message || e);
  process.exit(1);
});
