# VeilPay

**Invoicing on Solana, built to actually land.**

Live: [veilpay-tjscode.netlify.app](https://veilpay-tjscode.netlify.app)

---

## What VeilPay Does

A freelancer creates an invoice. The client pays in USDC. VeilPay's **Smart TX Stack** — dynamic Jito tips + a Groq AI retry agent — gets that payment to land, even when Solana is congested and a plain wallet transfer would stall.

**Architecture:**

```
Client clicks "Pay Invoice"
        ↓
1. BUILD      — payment-transfer.js builds one transaction:
                recipient transfer + 2% platform fee + Jito tip
        ↓
2. SIGN       — Client signs once in Phantom
        ↓
3. SUBMIT     — VeilPay's Smart TX Stack submits it as a Jito
                bundle with a live-market tip. If Jito's block
                engine has a bad moment, it falls back to a plain
                RPC send automatically.
        ↓
4. RETRY?     — If it stalls or fails, a Groq AI agent — not a
                hardcoded if/else — decides whether to retry and
                at what tip, based on live network conditions.
        ↓
5. LANDED     — USDC settles on Solana mainnet directly into the
                recipient's wallet. No separate claim step.
                (github.com/OlatundeOlabanj/smart-tx-stack)
```

Every step above is real and live — no testnet, no simulation.

### Why not private/confidential payments?

VeilPay started as a privacy-focused payment app (first on MagicBlock's
Ephemeral Rollups, then briefly scoped around Solana's Token-2022
Confidential Transfer extension). Both got dropped:

- **MagicBlock** — removed outright; no longer part of the architecture.
- **Token-2022 Confidential Transfers** — USDC's mint predates
  Token-2022 and can't gain the extension retroactively. Circle
  would need to issue a separate Token-2022 USDC for that to even be
  possible. On top of that, the JS client libraries for building
  confidential transfers are still immature, and a bug in the
  ElGamal/proof-generation path is a known way for funds to get
  **permanently stuck** in a pending confidential balance. Shipping
  that untested, with real client money, wasn't worth the risk.

So VeilPay's value prop today is **reliability, not privacy**: a
payment that's built to land, not one that's hidden. Amounts and
wallet addresses are visible on Solana's public ledger, same as any
standard transfer — see `privacy.html` / `tos.html` for the honest
version of this.

### Swap

Swap SPL tokens (SOL, USDC, USDT) with quotes from Jupiter's public
aggregator (live). Execution is disabled (`SWAP_EXECUTION_ENABLED =
false` in `swap.js`) — MagicBlock's Hydra crank had no direct
replacement, and building real settlement wasn't in scope for this
push. Quotes and balance UI still render.

---

## Features

- **Real USDC invoices** — 2% platform fee, one signature, lands directly in the recipient's wallet
- **Smart TX Stack** — live Jito tip calculation, Jito bundle submission with automatic RPC fallback, Groq AI retry agent — all real, all mainnet
- **Swap quotes** — live via Jupiter; execution coming soon
- **Recurring invoices** — same payment flow, repeating on a billing cycle
- **Wallet integration** — Phantom, auto-reconnect

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript — no framework, no build step |
| Wallet | Phantom (`window.solana`) |
| Payment Transfer | Hand-rolled SPL Token instructions (no `@solana/spl-token` package — no build step means no bundler to pull it in) |
| Reliable Submission | Smart TX Stack — Jito bundles, dynamic tips, Groq AI retry agent |
| Swap Quotes | Jupiter public aggregator API |
| RPC | Solana mainnet-beta, via Helius (proxied through a Netlify Function, origin-checked) |
| Hosting | Netlify |

---

## Project Structure

```
veilpay/
├── index.html               # Landing page
├── dashboard.html           # Invoices, Swap, Recurring tabs
├── pay.html                 # Client-facing invoice payment page
├── style.css                 # Shared styling
├── app.js                    # Shared helpers (wallet state, toasts, invoices)
├── payment-transfer.js       # Real SPL USDC transfer instruction builder
├── smart-tx.js                # Smart TX Stack client wrapper
├── veil-engine.js             # Orchestration — build, sign, submit, confirm, retry
├── swap.js                    # Swap integration (execution disabled)
├── netlify/functions/
│   ├── rpc-proxy.js           # Helius RPC proxy (origin-checked)
│   ├── get-tip.js              # Live Jito tip floor + tip account
│   ├── reason-retry.js         # Groq AI retry decision agent
│   └── submit-bundle.js        # Jito bundle submission + RPC fallback
└── README.md
```

---

## Known Limitations

- **Swap execution is disabled.** Quotes work via Jupiter; there's no settlement flow wired up yet.
- **Dispute resolution** is in progress and not yet connected to the payment flow.
- **Confidential/private payments are not on the near-term roadmap** — see the note above on why. If Circle ever issues a Token-2022 USDC and the JS proof-generation tooling matures, this could be revisited.
- **RPC proxy has a lightweight origin check**, not real rate limiting. Fine for launch; revisit if abuse shows up.

---

## Built By

**TJS Code** — [@JonahTunde](https://x.com/JonahTunde) on X
