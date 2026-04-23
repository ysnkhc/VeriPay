# VeriPay Loop

**Agent-to-agent nanopayment protocol on Arc blockchain.**

One AI agent requests work, another gets paid per action — 50–100+ individual onchain settlements per session. Sub-cent economics that only work on a low-gas chain.

## What This Is

VeriPay Loop is an open protocol where:

- **Customer agents** discover providers, open sessions, and pay per action
- **Provider agents** register endpoints, receive work, and earn per action
- **Every successful action** settles individually onchain via USDC
- **Failed/timeout actions** are recorded but never settled — providers only earn on delivery
- Both sides participate through **HTTP endpoints only** — no UI required

Tested end-to-end with real external agent processes on Arc Testnet.

---

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (forge, anvil)

### Option A: Local Anvil (recommended for demo)

```bash
# Terminal 1: Start Anvil
anvil

# Terminal 2: Deploy contracts
cd contracts
forge install
bash script/demo-deploy.sh

# Terminal 3: Start backend
cd backend
npm install
npm run dev
# Look for: ONCHAIN MODE

# Terminal 4: Start frontend
cd frontend
npm install
npm run dev
# Open http://localhost:3000/loop
```

### Option B: Arc Testnet

```bash
# Set your deployer private key (must have Arc testnet funds)
export PRIVATE_KEY=0x_YOUR_KEY_HERE

# Deploy contracts to Arc Testnet
cd contracts
node script/deploy-arc-testnet.js
# This writes backend/.env and frontend/.env.local automatically

# Start backend + frontend as above
```

### Environment Files

Backend and frontend each need environment variables. The deploy scripts write these automatically. To set up manually:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
# Edit both files with your contract addresses and RPC URL
```

---

## Architecture

```
External Customer Agent ──HTTP──▸ VeriPay Backend ──HTTP──▸ External Provider Agent
                                       │
                                 Smart Contracts
                            (UsageMeter + NanoSettlement)
                                       │
                                  Arc Blockchain
```

### Protocol Flow
1. Provider registers endpoint + pricing via `POST /api/agents/providers/register`
2. Customer authenticates via wallet signature (`/api/auth/challenge` → `/api/auth/verify`)
3. Customer creates session via `POST /api/protocol/sessions/create`
4. For each action:
   - Customer sends action request → receives **402 Payment Required** with EIP-712 payload
   - Customer signs payment with wallet → resends with `X-Payment-Authorization` header
   - Backend invokes provider endpoint with real HTTP call
   - On success: action recorded + settled onchain (provider gets paid)
   - On failure/timeout: action recorded, no settlement
5. Customer finalizes session via `POST /api/protocol/sessions/:id/finalize`

### Contracts

| Contract | Source File | Purpose |
|----------|------------|---------|
| UsageMeter | `src/JobRegistry.sol` | Session lifecycle, action recording |
| NanoSettlement | `src/EscrowVault.sol` | USDC escrow, per-action settlement |
| AgentRegistry | `src/EvaluatorRouter.sol` | Agent identity + pricing |
| MockUSDC | `src/mocks/MockUSDC.sol` | Test USDC token (6 decimals) |

### Protocol Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/agents/providers/register` | Register provider agent |
| POST | `/api/agents/customers/register` | Register customer agent |
| POST | `/api/auth/challenge` | Request auth challenge |
| POST | `/api/auth/verify` | Verify signature → bearer token |
| GET | `/api/protocol/providers` | Discover providers + pricing |
| POST | `/api/protocol/sessions/create` | Create session with budget |
| POST | `/api/protocol/sessions/:id/action` | Execute action (402-gated) |
| GET | `/api/protocol/sessions/:id` | Session state + budget |
| POST | `/api/protocol/sessions/:id/finalize` | Finalize session |

### Frontend Pages

| Page | Purpose |
|------|---------|
| `/` | Landing page |
| `/loop` | Session runner — live action stream, counters, margin breakdown |
| `/metrics` | Dashboard — aggregate stats, per-agent revenue, settlement feed |
| `/agents` | Provider catalog with pricing tables |
| `/protocol` | Agent registration + protocol demo |

---

## External Agent Scripts

VeriPay Loop includes standalone scripts that prove both sides of the network work as independent processes:

### External Provider Agent

A standalone HTTP server that receives action requests and returns structured outputs.

```bash
node backend/test/external-provider-agent.js --mode mixed --fail-at 3 --timeout-at 4
```

Supports modes: `success`, `fail`, `timeout`, `mixed`

### External Customer Agent

A standalone script that runs the full customer flow through protocol endpoints only.

```bash
node backend/test/external-customer-agent.js --actions 5
```

### Full E2E Network Test

Orchestrates both external agents through VeriPay Loop with real onchain settlement.

```bash
# Terminal 1: Backend running
# Terminal 2: Start external provider
node backend/test/external-provider-agent.js --mode mixed

# Terminal 3: Run network test
node backend/test/e2e-external-agent-network.js --actions 6
```

This test:
- Registers an external provider with a real HTTP endpoint
- Registers an external customer with a fresh wallet
- Authenticates via wallet signature
- Creates a session with real onchain escrow
- Executes actions through the 402 payment flow
- Verifies success, failure, and timeout behaviors
- Confirms real Arc Testnet tx hashes for successful actions
- Confirms no settlement for failed/timeout actions
- Finalizes the session

---

## Payment Model

| Action Type | Price (USDC) |
|-------------|-------------|
| API Lookup | 0.001 |
| JSON Transform | 0.002 |
| Summarize | 0.003 |
| Classify | 0.002 |
| Final Answer | 0.005 |

Each action settles as an **individual onchain transaction**.
100 actions = 100 separate settlements.

---

## Tech Stack

- **Contracts**: Solidity 0.8.24, Foundry, OpenZeppelin
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Lucide icons
- **Backend**: Node.js, Express, TypeScript, ethers.js v6
- **Chain**: Arc Testnet (or local Anvil)
- **Payments**: USDC (6 decimals) — sub-cent per-action settlement
- **Auth**: Wallet-based challenge/response + EIP-712 payment signing

## Testing

### Smart Contracts
```bash
cd contracts
forge test -vv
```

### Backend Type Check
```bash
cd backend
npx tsc --noEmit
```

### Frontend Build
```bash
cd frontend
npm run build
```

### E2E Protocol Test
```bash
cd backend
node test/e2e-protocol-test.js
```

---

## Security Notes

- Private keys are **never committed** — all secrets live in `.env` files (gitignored)
- Deploy scripts read keys from environment variables
- The only hardcoded key in the repo is Foundry's well-known Anvil account #0 in `demo-deploy.sh` (local dev only)
- Test scripts generate ephemeral wallets at runtime

---

Built for Arc Hackathon
