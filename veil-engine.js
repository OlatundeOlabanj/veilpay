/**
 * VeilPay Engine — payment orchestration
 * Composes PaymentTransfer (real SPL USDC transfer) with SmartTX
 * (real Jito submission + tip + Groq retry agent). This is the
 * public API the rest of the app calls (dashboard.html, pay.html,
 * app.js). Everything below is real — no simulation, no testnet.
 *
 * Made by TJS Code
 */

const VeilEngine = (() => {
  const MAX_RETRIES = 2;
  const CONFIRM_TIMEOUT_MS = 45_000;
  const CONFIRM_POLL_MS = 2_000;

  const _B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function _base58Encode(bytes) {
    let digits = [0];
    for (let i = 0; i < bytes.length; i++) {
      let carry = bytes[i];
      for (let j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
    }
    let leadingZeros = 0;
    for (let i = 0; i < bytes.length && bytes[i] === 0; i++) leadingZeros++;
    let result = '1'.repeat(leadingZeros);
    for (let i = digits.length - 1; i >= 0; i--) result += _B58_ALPHABET[digits[i]];
    return result;
  }

  function _truncate(pk) {
    if (!pk || pk.length < 10) return pk;
    return `${pk.slice(0, 4)}...${pk.slice(-4)}`;
  }

  function _getPhantom() {
    return window.solana || window.phantom?.solana || null;
  }

  async function _rpc(method, params) {
    const res = await fetch('/api/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || `RPC ${method} failed`);
    return data.result;
  }

  async function init() {
    console.log('[VeilPay] Engine ready — real mainnet USDC transfers via Smart TX Stack.');
    return { success: true, simulated: false };
  }

  async function connectWallet() {
    const phantom = _getPhantom();
    if (!phantom || !phantom.isPhantom) {
      throw new Error('Phantom wallet not found. Please install the Phantom browser extension.');
    }
    const response = await phantom.connect();
    const publicKey = response.publicKey.toString();
    console.log('[VeilPay] Wallet connected:', _truncate(publicKey));
    return { publicKey, truncated: _truncate(publicKey), provider: phantom };
  }

  async function createPrivatePayment({ amount, recipientWallet, invoiceId, description }) {
    try {
      if (typeof window.solanaWeb3 !== 'undefined') new window.solanaWeb3.PublicKey(recipientWallet);
      return {
        paymentId: invoiceId,
        link: `${window.location.origin}/pay.html?id=${invoiceId}`,
        success: true,
      };
    } catch {
      throw new Error('Invalid wallet address. Please reconnect your wallet.');
    }
  }

  /** Waits for a signature to confirm, polling getSignatureStatuses. */
  async function _waitForConfirmation(signature) {
    const start = Date.now();
    while (Date.now() - start < CONFIRM_TIMEOUT_MS) {
      const result = await _rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
      const status = result?.value?.[0];
      if (status) {
        if (status.err) return { confirmed: false, failed: true, err: status.err };
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
          return { confirmed: true, failed: false };
        }
      }
      await new Promise(r => setTimeout(r, CONFIRM_POLL_MS));
    }
    return { confirmed: false, failed: false, timedOut: true };
  }

  /**
   * SAFETY-CRITICAL: before we're allowed to submit a retry transaction,
   * we must be certain the previous attempt can never land on-chain later —
   * otherwise a timeout + retry could silently double-charge the payer.
   * Solana guarantees a transaction can NEVER confirm once its blockhash
   * has expired, so we poll isBlockhashValid until that's true (or the
   * signature itself confirms in the meantime, in which case we report
   * that as a real success instead of retrying).
   */
  async function _waitForSafeRetry(signature, blockhash) {
    const start = Date.now();
    const SAFE_RETRY_TIMEOUT_MS = 90_000; // generous — blockhashes expire well within this
    while (Date.now() - start < SAFE_RETRY_TIMEOUT_MS) {
      // Did it actually land while we were waiting? Don't retry — it succeeded.
      const statusResult = await _rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
      const status = statusResult?.value?.[0];
      if (status && !status.err && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
        return { landedLate: true };
      }
      const validResult = await _rpc('isBlockhashValid', [blockhash, { commitment: 'confirmed' }]);
      const stillValid = validResult?.value ?? validResult;
      if (!stillValid) {
        // Blockhash is expired — the original transaction can now never land. Safe to retry.
        return { landedLate: false, safeToRetry: true };
      }
      await new Promise(r => setTimeout(r, CONFIRM_POLL_MS));
    }
    // Extremely unlikely to hit this, but fail safe: don't retry if we can't confirm expiry.
    return { landedLate: false, safeToRetry: false };
  }

  /**
   * Executes a real payment: build the transaction, sign with
   * Phantom, submit via the Smart TX Stack, confirm on-chain. On
   * failure or timeout, asks the Groq retry agent whether to try
   * again with a fresh blockhash and higher tip.
   */
  async function executePrivatePayment({ paymentId, payerWallet, recipientWallet, amount, onProgress }) {
    const phantom = _getPhantom();
    if (!phantom) throw new Error('Wallet not connected.');

    let urgency = 'MEDIUM';
    let attempt = 0;
    let lastError = null;

    while (attempt <= MAX_RETRIES) {
      attempt++;
      onProgress?.('depositing'); // "Building transaction" step in the UI

      const { tipLamports, tipAccount } = await SmartTX.getTip(urgency);
      const { blockhash } = await _rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]).then(r => r.value ?? r);

      const { transaction, feeBaseUnits } = await PaymentTransfer.buildPaymentTransaction({
        payerWallet, recipientWallet, amount, tipLamports, tipAccount,
      });
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new window.solanaWeb3.PublicKey(payerWallet);

      const signedTx = await phantom.signTransaction(transaction);
      const serialized = signedTx.serialize();
      const signedTxBase64 = btoa(String.fromCharCode(...serialized));
      const signature = _base58Encode(signedTx.signatures[0].signature);

      onProgress?.('transferring'); // "Submitting via Smart TX Stack" step in the UI
      const submission = await SmartTX.submitTransaction({ signedTxBase64, signature });

      if (!submission.success) {
        lastError = submission.error || 'Submission failed';
        const decision = await SmartTX.reasonAboutFailure(
          { signature, failure_type: 'BundleExecutionFailure', retry_count: attempt - 1, tip_paid_lamports: tipLamports },
          { congestion_level: 'UNKNOWN', recent_avg_confirmation_ms: null, recent_failure_rate: 0.1 },
        );
        if (decision.should_retry && attempt <= MAX_RETRIES) { urgency = 'HIGH'; continue; }
        throw new Error(lastError);
      }

      const outcome = await _waitForConfirmation(signature);
      if (outcome.confirmed) {
        return {
          txHash: signature,
          status: 'confirmed',
          success: true,
          simulated: false,
          feeBaseUnits,
          tipLamports,
          usedFallback: submission.usedFallback || false,
          explorerUrl: `https://solscan.io/tx/${signature}`,
        };
      }

      // On a hard on-chain failure (not a timeout), it's already safe to retry —
      // the transaction is confirmed dead, it can't land later.
      if (outcome.failed) {
        lastError = `Transaction failed on-chain: ${JSON.stringify(outcome.err)}`;
        const decision = await SmartTX.reasonAboutFailure(
          { signature, failure_type: 'BundleExecutionFailure', retry_count: attempt - 1, tip_paid_lamports: tipLamports },
          { congestion_level: 'MEDIUM', recent_avg_confirmation_ms: CONFIRM_TIMEOUT_MS, recent_failure_rate: 0.15 },
        );
        if (decision.should_retry && attempt <= MAX_RETRIES) { urgency = 'CRITICAL'; continue; }
        throw new Error(lastError);
      }

      // Confirmation timed out — this does NOT mean it failed. It could still
      // land. Never submit a second transaction until we're certain the first
      // one can no longer confirm (blockhash expired).
      onProgress?.('transferring'); // stays on the same step — still safeguarding, not a new attempt yet
      const safety = await _waitForSafeRetry(signature, blockhash);
      if (safety.landedLate) {
        return {
          txHash: signature,
          status: 'confirmed',
          success: true,
          simulated: false,
          feeBaseUnits,
          tipLamports,
          usedFallback: submission.usedFallback || false,
          explorerUrl: `https://solscan.io/tx/${signature}`,
        };
      }
      if (!safety.safeToRetry) {
        throw new Error('Payment status is unclear — please check your wallet history before trying again to avoid a double payment.');
      }

      lastError = 'Confirmation timed out';
      const decision = await SmartTX.reasonAboutFailure(
        { signature, failure_type: 'Timeout', retry_count: attempt - 1, tip_paid_lamports: tipLamports },
        { congestion_level: 'HIGH', recent_avg_confirmation_ms: CONFIRM_TIMEOUT_MS, recent_failure_rate: 0.15 },
      );
      if (decision.should_retry && attempt <= MAX_RETRIES) { urgency = 'CRITICAL'; continue; }
      throw new Error(lastError);
    }

    throw new Error(lastError || 'Payment failed after retries.');
  }

  return {
    init,
    connectWallet,
    createPrivatePayment,
    executePrivatePayment,
    get isSimulated() { return false; },
  };
})();

window.VeilEngine = VeilEngine;

window.addEventListener('DOMContentLoaded', () => {
  VeilEngine.init();
});
