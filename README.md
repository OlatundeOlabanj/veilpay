# VeilPay — Private Freelance Payments on Solana

> Built by **TJS Code** for Colosseum Hackathon 2026

---

## What is VeilPay?

Freelancers using public Solana payments expose their full wallet history to every client they invoice. VeilPay fixes this.

VeilPay shields transaction amounts and wallet activity using **MagicBlock's Private Ephemeral Rollups** while keeping payments verifiable on-chain — giving freelancers financial privacy without sacrificing trust.

---

## Stack

| Layer       | Technology                                 |
|-------------|-------------------------------------------|
| Frontend    | Pure HTML / CSS / JavaScript — no build tools |
| Blockchain  | Solana (Devnet → Mainnet)                  |
| Privacy     | MagicBlock Private Payments API (PER)      |
| Wallet      | Phantom Browser Extension                  |
| Storage     | localStorage (demo) → decentralized (prod) |
| Payments    | USDC on Solana                             |

---

## File Structure

```
veilpay/
├── index.html      — Landing page (hero, features, how it works)
├── dashboard.html  — Freelancer dashboard (create invoices, view list)
├── pay.html        — Client payment page (connect wallet, pay)
├── style.css       — Shared design system stylesheet
├── app.js          — Application logic, utilities, localStorage
├── magicblock.js   — MagicBlock SDK integration + mock fallback
└── README.md       — This file
```

---

## Setup & Running

### Prerequisites

- A modern browser (Chrome, Brave, Firefox)
- [Phantom Wallet](https://phantom.app) browser extension installed
- A MagicBlock API key (get one at [docs.magicblock.gg](https://docs.magicblock.gg))

### Steps

1. **Clone the repo**
   ```bash
   git clone https://github.com/yourname/veilpay
   cd veilpay
   ```

2. **Set your MagicBlock API key**
   Open `magicblock.js` and replace the placeholder:
   ```js
   const MAGICBLOCK_CONFIG = {
     apiKey: 'PASTE_YOUR_MAGICBLOCK_API_KEY_HERE',  // ← replace this
     network: 'devnet',
     rpcEndpoint: 'https://devnet.magicblock.app'
   };
   ```

3. **Serve the app** (any static server works)
   ```bash
   npx serve .
   # or
   python3 -m http.server 3000
   ```

4. **Configure Phantom for Devnet**
   - Open Phantom → Settings → Developer Settings → Change Network → Devnet

5. **Airdrop test SOL**
   Visit [faucet.solana.com](https://faucet.solana.com) and airdrop 1-2 SOL to your Devnet wallet.

---

## Demo Flow

### As a Freelancer
1. Open `dashboard.html`
2. Click **Connect Wallet** — approve in Phantom
3. Fill in the invoice form: client name, service description, USDC amount
4. Click **Generate Invoice Link**
5. Copy the payment link from the modal
6. Share via the **WhatsApp** button or copy manually

### As a Client
1. Open the shared payment link (`pay.html?id=...`)
2. Review the invoice details
3. Click **Connect Wallet to Pay** — approve in Phantom
4. Click **Pay [X] USDC**
5. Approve the transaction in Phantom
6. Watch the shielded payment confirm — confetti fires on success

---

## Mock Mode

If no MagicBlock API key is configured or the SDK fails to load, `magicblock.js` automatically enters **Mock Mode**. In this mode:

- All SDK calls are simulated with realistic fake data
- Console logs are prefixed with `[MOCK MODE]`
- The full UI flow is testable without a real API key or Phantom wallet
- Mock transaction hashes and payment IDs are generated locally

This means you can test the complete UX without any external dependencies.

---

## Environment Config

| Variable               | Default                              | Description                    |
|------------------------|--------------------------------------|--------------------------------|
| `apiKey`               | `PASTE_YOUR_MAGICBLOCK_API_KEY_HERE` | MagicBlock API key             |
| `network`              | `devnet`                             | Solana network                 |
| `rpcEndpoint`          | `https://devnet.magicblock.app`      | MagicBlock RPC endpoint        |

Switch to mainnet:
```js
const MAGICBLOCK_CONFIG = {
  apiKey: 'your-production-api-key',
  network: 'mainnet-beta',
  rpcEndpoint: 'https://mainnet.magicblock.app'
};
```

---

## Design System

| Token           | Value                    |
|-----------------|--------------------------|
| Background      | `#05080f`                |
| Card background | `#0d1117`                |
| Border          | `#1a2332`                |
| Primary accent  | `#f59e0b` (amber/gold)   |
| Accent hover    | `#d97706`                |
| Success         | `#10b981`                |
| Error           | `#ef4444`                |
| Muted text      | `#6b7280`                |
| Body font       | Space Grotesk            |
| Monospace font  | JetBrains Mono           |
| Button radius   | 15px                     |

---

## Why MagicBlock?

MagicBlock's **Private Ephemeral Rollups (PER)** enable:

- **Sub-400ms latency** for transaction confirmation
- **Near-zero fees** at scale via Ephemeral Rollup batching
- **On-chain verifiability** — proofs are anchored to Solana L1
- **Shielded transaction amounts** — balances and history are not exposed on the public ledger

This is exactly what freelancers need: payments that are fast, cheap, and private by default.

---

## License

MIT — free to use, fork, and build upon.

---

*Made by TJS Code — VeilPay — Colosseum Hackathon 2026*
