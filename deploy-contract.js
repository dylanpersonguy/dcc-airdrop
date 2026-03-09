const fs = require('fs');
const { setScript, broadcast, invokeScript } = require('@waves/waves-transactions');

const NODE_URL = process.env.DCC_NODE_URL || 'https://mainnet-node.decentralchain.io';
const SEED = process.env.DEPLOYER_SEED;
const CHAIN_ID = Number(process.env.DCC_CHAIN_ID) || 63;

if (!SEED) {
  console.error('Error: DEPLOYER_SEED environment variable is required.');
  console.error('Usage: DEPLOYER_SEED="your seed phrase" node deploy-contract.js');
  process.exit(1);
}

async function compileRide(source) {
  const resp = await fetch(`${NODE_URL}/utils/script/compileCode`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: source,
  });
  const data = await resp.json();
  if (data.error) throw new Error(`Compile error: ${JSON.stringify(data)}`);
  return data.script; // base64 compiled script
}

async function main() {
  // 1. Read and compile the RIDE contract
  console.log('Reading EligibilityTracker.ride...');
  const source = fs.readFileSync('./EligibilityTracker.ride', 'utf8');

  console.log('Compiling contract...');
  const compiledScript = await compileRide(source);
  console.log('Compiled script length:', compiledScript.length);

  // 2. Create and broadcast SetScript transaction
  console.log('Creating SetScript transaction...');
  const setScriptTx = setScript({ script: compiledScript, chainId: CHAIN_ID, fee: 1400000 }, SEED);
  console.log('Transaction ID:', setScriptTx.id);
  console.log('Sender:', setScriptTx.sender);

  console.log('Broadcasting SetScript...');
  const setScriptResult = await broadcast(setScriptTx, NODE_URL);
  console.log('SetScript broadcast success! TX:', setScriptResult.id);

  // 3. Wait a bit for the transaction to be mined
  console.log('Waiting 10s for block confirmation...');
  await new Promise(r => setTimeout(r, 10000));

  // 4. Call init() on the contract
  console.log('Calling init()...');
  const deployerAddress = setScriptTx.sender;
  const initTx = invokeScript({
    dApp: deployerAddress,
    call: { function: 'init', args: [] },
    payment: [],
    chainId: CHAIN_ID,
    fee: 500000,
  }, SEED);
  console.log('Init TX ID:', initTx.id);

  console.log('Broadcasting init()...');
  const initResult = await broadcast(initTx, NODE_URL);
  console.log('init() broadcast success! TX:', initResult.id);

  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log('Contract address:', setScriptTx.sender);
  console.log('SetScript TX:', setScriptResult.id);
  console.log('Init TX:', initResult.id);
}

main().catch(err => {
  console.error('Deployment failed:', err.message || err);
  process.exit(1);
});
