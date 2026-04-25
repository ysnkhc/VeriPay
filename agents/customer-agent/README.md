# VeriPay Customer Agent — Automated Buyer

Standalone runner that buys AI risk analysis from a provider agent via VeriPay's **offchain metering + onchain settlement** protocol on Arc Testnet.

## How It Works

```
Customer Agent ──HTTP──▸ VeriPay Backend ──HTTP──▸ Provider Agent
(buyer, 402 flow)        (offchain meter)          (AI service)
                              │
                              ▼
                         Arc Testnet
                    (1 settle tx per batch)
```

1. Customer registers + authenticates (wallet signature, EIP-191)
2. Creates a payment session (onchain: create + deposit = 2 txs)
3. Executes N actions via 402 payment protocol — **all offchain, zero onchain txs**
4. Each action is cryptographically committed to a Merkle-style **action root**
5. At finalize: **single `settleOffchain` tx** settles all actions + posts action root onchain
6. Session finalized onchain (1 tx)

**Result: 100 actions → 4 total onchain txs (1 settle + 3 lifecycle)**

### What is "Offchain Metering + Onchain Settlement"?

Traditional per-action settlement writes every action onchain — 200+ txs for 100 actions. VeriPay meters actions **offchain** with a cryptographic action root (Merkle-style hash chain) and settles them in **one batch transaction**. The action root proves all actions existed and were not tampered with. This matches the [Arc Nanopayments](https://docs.arc.network) design: high-frequency micro-interactions settled in minimal onchain txs.

## Prerequisites

1. **Node.js** ≥ 18
2. **VeriPay backend** running on port 3001 (`cd backend && npm run dev`)
3. **Provider agent** running on port 4101 (`cd agents/provider-agent && npm start`)
4. **3 separate wallets**: deployer/operator, provider, customer

### Wallet Setup

Generate a customer wallet:
```bash
node -e "const w = require('ethers').Wallet.createRandom(); console.log('Address:', w.address); console.log('Private Key:', w.privateKey)"
```

### Arc Testnet Funding

The customer wallet needs native gas tokens for signing (the operator pays USDC):
- **Arc Faucet**: https://faucet.arc.network (Chain ID: 5042002)
- Or the deploy script auto-funds the customer from the operator

## Setup

```bash
cd agents/customer-agent
cp .env.example .env
# Edit .env — set CUSTOMER_AGENT_PRIVATE_KEY
npm install
```

## Run

### Test (5 actions)
```bash
node runner.js --test
```

### Demo (50 actions)
```bash
node runner.js --demo
```

### Demo 100 (100 actions — full offchain metering demo)
```bash
node runner.js --demo100
```

## Full Demo Flow

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Provider agent
cd agents/provider-agent && npm start

# Terminal 3: Customer — 100-action demo
cd agents/customer-agent && node runner.js --demo100
```

## Expected Output (demo100)

```
════════════════════════════════════════════════════════════
  VeriPay Customer Agent — DEMO100 mode (100 actions)
════════════════════════════════════════════════════════════
── 7. Action Loop (100 actions, concurrency=8, offchain metering)
  #  1 [✔] API_LOOKUP     → ...  | 0.0010 USDC [PENDING]
  ...
  #100 [✔] FINAL_ANSWER   → ...  | 0.0010 USDC [PENDING]

  → All 100 actions executed in ~1s

── 8. Settlement & Finalization
  ✅ Session finalized
  Settled actions:  100
  Total paid:       100000 micro-USDC

── Summary
  Total actions:     100
  Action exec:       ~1s (concurrency=8)
  Batch txs:         1 (vs 100 per-action)
  Action root:       0x7f4c56fe31875d93d8...
  Actions [first]:   0
  Actions [last]:    99

── Batch Settlement Transactions
  Batch #0: 100 actions → 0.1000 USDC → [onchain]
    https://testnet.arcscan.app/tx/0x...

  ✅ All 100 actions completed successfully.
     100 actions → 4 total onchain txs (1 settle + 3 lifecycle)

── Economic Argument
  Ethereum L1 (old):  203 txs × $0.50 = $101.50 → impossible
  Ethereum L1 (new):  4 txs × $0.50 = $2.00 → viable but expensive
  Arc (new):          4 txs × ~$0.0001 = $0.0004 → negligible
  Savings: 203 → 4 txs (50× reduction), $101.50 → $0.0004
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `CUSTOMER_AGENT_PRIVATE_KEY` | *required* | Customer wallet private key |
| `VERIPAY_BACKEND_URL` | `http://localhost:3001` | VeriPay backend URL |
| `PROVIDER_AGENT_PORT` | `4101` | Provider agent port |
| `CUSTOMER_AGENT_BUDGET_USDC` | auto-scaled | Session budget (auto: 1.6× action cost) |
| `ARC_RPC_URL` | `https://rpc.testnet.arc.network` | Arc Testnet RPC |
| `CHAIN_ID` | `5042002` | Arc Testnet chain ID |

## Security

- Private key loaded from `.env` only — never hardcoded or logged
- `.env` is gitignored — never committed
- Wallet address derived at startup (safe to display)
- EIP-712 payment signatures per-action with nonces — replay-protected
- Budget enforced server-side — customer cannot overspend
- Fallback mode clearly labeled `[fallback]` when contracts not deployed
