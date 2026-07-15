// netlify/functions/submit-bundle.js
//
// Real Jito bundle submission — ported and adapted from
// smart-tx-stack's src/execution/jito.ts
// (github.com/OlatundeOlabanj/smart-tx-stack), changed to accept an
// already wallet-signed transaction (this is a payments app — the
// user's wallet signs, not a server-held Keypair) and to target
// Jito's MAINNET block engine instead of testnet.
//
// Submits the signed transaction as a 1-transaction Jito bundle.
// If Jito's block engine is unreachable or rejects it, falls back
// to a plain sendTransaction via Helius so a payment never just
// silently fails because Jito had a bad moment.
//
// Made by TJS Code

const JITO_BUNDLES_URL = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';

async function submitViaJito(signedTxBase64) {
  const res = await fetch(JITO_BUNDLES_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendBundle',
      params: [[signedTxBase64], { encoding: 'base64' }],
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Jito rejected the bundle');
  return { bundleId: data.result };
}

async function submitViaRpcFallback(signedTxBase64) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) throw new Error('HELIUS_API_KEY not set — cannot fall back');
  const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [signedTxBase64, { encoding: 'base64', skipPreflight: false, maxRetries: 3 }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'RPC fallback rejected the transaction');
  return { signature: data.result };
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  const origin = event.headers?.origin || event.headers?.referer || '';
  if (origin && !origin.includes('veilpay-tjscode.netlify.app') && !origin.includes('localhost')) {
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden origin.' }) };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed. Use POST.' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body.' }) };
  }

  const { signedTxBase64, signature } = body;
  if (!signedTxBase64 || !signature) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'signedTxBase64 and signature are required.' }) };
  }

  try {
    const { bundleId } = await submitViaJito(signedTxBase64);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, signature, bundleId, usedFallback: false }) };
  } catch (jitoErr) {
    try {
      await submitViaRpcFallback(signedTxBase64);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, signature, usedFallback: true, jitoError: jitoErr.message }) };
    } catch (fallbackErr) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: false, signature, error: `Jito failed (${jitoErr.message}); fallback also failed (${fallbackErr.message})` }),
      };
    }
  }
};
