/**
 * VeilPay — Main Application Logic
 * Made by TJS Code
 */

// ─── UUID Generator ────────────────────────────────────────────────────────────

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── LocalStorage Helpers ──────────────────────────────────────────────────────

const INVOICE_PREFIX = 'veilpay_invoice_';
const INVOICE_INDEX  = 'veilpay_invoice_index';

function saveInvoice(invoice) {
  try {
    localStorage.setItem(`${INVOICE_PREFIX}${invoice.id}`, JSON.stringify(invoice));
    // Maintain an index of invoice IDs
    const index = getInvoiceIndex();
    if (!index.includes(invoice.id)) {
      index.unshift(invoice.id); // newest first
      localStorage.setItem(INVOICE_INDEX, JSON.stringify(index));
    }
    return true;
  } catch (err) {
    console.error('[VeilPay] Failed to save invoice:', err);
    return false;
  }
}

function getInvoice(id) {
  try {
    const raw = localStorage.getItem(`${INVOICE_PREFIX}${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error('[VeilPay] Failed to read invoice:', err);
    return null;
  }
}

function getAllInvoices() {
  const index = getInvoiceIndex();
  return index.map(id => getInvoice(id)).filter(Boolean);
}

function getInvoiceIndex() {
  try {
    const raw = localStorage.getItem(INVOICE_INDEX);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function updateInvoiceStatus(id, status, extra = {}) {
  const invoice = getInvoice(id);
  if (!invoice) return false;
  Object.assign(invoice, { status, ...extra });
  return saveInvoice(invoice);
}

// ─── Wallet State ──────────────────────────────────────────────────────────────

const WalletState = {
  _key: 'veilpay_wallet',

  get() {
    try {
      const raw = sessionStorage.getItem(this._key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  set(data) {
    try {
      // Only store serializable fields — never the Phantom provider object
      const safe = { publicKey: data.publicKey, truncated: data.truncated };
      sessionStorage.setItem(this._key, JSON.stringify(safe));
    } catch (err) {
      console.error('[VeilPay] Failed to save wallet state:', err);
    }
  },

  clear() {
    sessionStorage.removeItem(this._key);
  },

  isConnected() {
    return !!this.get()?.publicKey;
  }
};

// ─── URL Params Parser ─────────────────────────────────────────────────────────

function getURLParam(key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
}

// ─── Copy to Clipboard ────────────────────────────────────────────────────────

async function copyToClipboard(text, triggerEl) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for browsers that block clipboard without user interaction
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  if (triggerEl) {
    showCopyFeedback(triggerEl);
  }

  showToast('Copied to clipboard', 'amber');
}

function showCopyFeedback(el) {
  // Add relative positioning if not already
  const original = el.style.position;
  if (!['relative', 'absolute', 'fixed'].includes(getComputedStyle(el).position)) {
    el.style.position = 'relative';
  }

  const tip = document.createElement('div');
  tip.className = 'copy-tooltip';
  tip.textContent = 'Copied!';
  el.appendChild(tip);

  setTimeout(() => {
    tip.remove();
    el.style.position = original;
  }, 1600);
}

// ─── WhatsApp Share ────────────────────────────────────────────────────────────

function shareViaWhatsApp(invoiceLink, clientName, amount) {
  const text = `Hi ${clientName || 'there'}, here is your VeilPay invoice for ${amount} USDC. Pay securely via this private link: ${invoiceLink}`;
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

// ─── Toast System ─────────────────────────────────────────────────────────────

let _toastContainer = null;

function getToastContainer() {
  if (!_toastContainer) {
    _toastContainer = document.querySelector('.toast-container');
    if (!_toastContainer) {
      _toastContainer = document.createElement('div');
      _toastContainer.className = 'toast-container';
      document.body.appendChild(_toastContainer);
    }
  }
  return _toastContainer;
}

function showToast(message, type = 'amber', duration = 3500) {
  const container = getToastContainer();

  const icons = {
    amber: `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    green: `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    red:   `<svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.amber}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    setTimeout(() => toast.remove(), 260);
  }, duration);
}

// ─── Date Formatter ────────────────────────────────────────────────────────────

function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoString;
  }
}

function formatAmount(amount) {
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// ─── Truncate Wallet ──────────────────────────────────────────────────────────

function truncateWallet(key) {
  if (!key || key.length < 10) return key || '';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// ─── Status Badge HTML ────────────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    pending:  { cls: 'badge-pending',  label: 'Pending' },
    paid:     { cls: 'badge-paid',     label: 'Paid'    },
    expired:  { cls: 'badge-expired',  label: 'Expired' },
  };
  const s = map[status] || map.pending;
  return `<span class="badge ${s.cls}"><span class="badge-dot"></span>${s.label}</span>`;
}

// ─── Invoice Card Renderer ────────────────────────────────────────────────────

function renderInvoiceCard(invoice, payLink) {
  const link = payLink || `${window.location.origin}/pay.html?id=${invoice.id}`;
  return `
    <div class="invoice-card" data-id="${invoice.id}">
      <div class="invoice-card-header">
        <div>
          <div class="invoice-client">${escapeHtml(invoice.clientName)}</div>
          <div style="font-size:0.78rem;color:var(--text-dim);margin-top:2px;">${formatDate(invoice.createdAt)}</div>
        </div>
        <div style="text-align:right;">
          <div class="invoice-amount">${formatAmount(invoice.amount)} USDC</div>
          <div style="margin-top:4px;">${statusBadge(invoice.status)}</div>
        </div>
      </div>
      <div class="invoice-desc">${escapeHtml(invoice.description)}</div>
      <div class="invoice-footer">
        <div class="invoice-actions">
          <button class="btn btn-ghost btn-sm" onclick="copyInvoiceLink('${invoice.id}')" style="position:relative;">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy Link
          </button>
          <a href="${link}" target="_blank" class="btn btn-ghost btn-sm">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            View
          </a>
        </div>
      </div>
    </div>
  `;
}

function copyInvoiceLink(invoiceId) {
  const link = `${window.location.origin}/pay.html?id=${invoiceId}`;
  copyToClipboard(link);
}

// Make globally accessible
window.copyInvoiceLink = copyInvoiceLink;

// ─── Empty State HTML ──────────────────────────────────────────────────────────

function renderEmptyState() {
  return `
    <div class="empty-state">
      <svg width="64" height="64" fill="none" viewBox="0 0 24 24" stroke="#6b7280" stroke-width="1.2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      <h4>No invoices yet</h4>
      <p>Create your first invoice using the form on the left.</p>
    </div>
  `;
}

// ─── HTML Escaping ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

function launchConfetti() {
  const wrapper = document.createElement('div');
  wrapper.className = 'confetti-wrapper';
  document.body.appendChild(wrapper);

  const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#f97316'];
  const count = 60;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.cssText = `
      left: ${Math.random() * 100}%;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      width: ${4 + Math.random() * 8}px;
      height: ${4 + Math.random() * 8}px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      animation-duration: ${1.8 + Math.random() * 2}s;
      animation-delay: ${Math.random() * 0.6}s;
    `;
    wrapper.appendChild(piece);
  }

  setTimeout(() => wrapper.remove(), 5000);
}

// ─── Wallet Connection UI Helper ──────────────────────────────────────────────

async function connectWalletUI({ onSuccess, onError } = {}) {
  try {
    const result = await MagicBlock.connectWallet();
    WalletState.set(result);
    if (onSuccess) onSuccess(result);
    return result;
  } catch (err) {
    const msg = err.message || 'Failed to connect wallet';
    if (msg.toLowerCase().includes('phantom')) {
      showToast('Phantom wallet not found. Please install it from phantom.app', 'red', 5000);
    } else {
      showToast(msg, 'red');
    }
    if (onError) onError(err);
    return null;
  }
}

// ─── Modal Helpers ─────────────────────────────────────────────────────────────

function openModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.add('active');
}

function closeModal(id) {
  const overlay = document.getElementById(id);
  if (overlay) overlay.classList.remove('active');
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// Close modal on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});

// ─── Expose globally ──────────────────────────────────────────────────────────

window.VeilPay = {
  generateUUID,
  saveInvoice,
  getInvoice,
  getAllInvoices,
  updateInvoiceStatus,
  WalletState,
  getURLParam,
  copyToClipboard,
  shareViaWhatsApp,
  showToast,
  formatDate,
  formatAmount,
  truncateWallet,
  statusBadge,
  renderInvoiceCard,
  renderEmptyState,
  escapeHtml,
  launchConfetti,
  connectWalletUI,
  openModal,
  closeModal,
};
