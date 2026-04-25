# VeriPay Provider Agent — Risk Analysis Service

Standalone HTTP server that sells deterministic AI risk analysis via the VeriPay nanopayment protocol on Arc Testnet.

## Architecture

```
Customer Agent ──HTTP──▸ VeriPay Backend ──HTTP──▸ Provider Agent (this)
                         (payment layer)           (AI service)
```

The VeriPay backend calls this provider's `/agent` endpoint during paid action execution. The provider never handles payments directly — VeriPay's settlement layer manages all USDC flows.

## Prerequisites

1. **Node.js** ≥ 18
2. **VeriPay backend** running on port 3001
3. **Provider wallet** with Arc Testnet funds

### Wallet Setup

Generate a new wallet:
```bash
node -e "const w = require('ethers').Wallet.createRandom(); console.log('Address:', w.address); console.log('Private Key:', w.privateKey)"
```

Fund it with testnet USDC from the Arc faucet:
- Go to https://faucet.circle.com
- Select **Arc Testnet** (Chain ID: 5042002)
- Paste your provider wallet address
- Request testnet USDC

## Setup

```bash
cd agents/provider-agent
cp .env.example .env
# Edit .env — set PROVIDER_AGENT_PRIVATE_KEY to your provider wallet key
npm install
```

## Run

```bash
npm start
```

Or from repo root (if root scripts configured):
```bash
npm run agent:provider
```

## Endpoints

### GET /health

Health check + stats.

```bash
curl http://localhost:4101/health
```

Response:
```json
{
  "agentId": "provider-risk-agent",
  "name": "Risk Analysis Provider",
  "wallet": "0x...",
  "service": "risk-analysis",
  "priceUsdc": "0.001",
  "status": "running",
  "stats": { "totalRequests": 0, "successes": 0, "failures": 0 }
}
```

### POST /provider/analyze-risk

Direct demo endpoint (no VeriPay payment required).

```bash
curl -X POST http://localhost:4101/provider/analyze-risk \
  -H "Content-Type: application/json" \
  -d '{"input": "suspicious transaction from new account", "sessionId": "demo", "actionIndex": 1}'
```

Response:
```json
{
  "agentId": "provider-risk-agent",
  "service": "risk-analysis",
  "priceUsdc": "0.001",
  "result": {
    "score": 72,
    "level": "HIGH",
    "reason": "Input \"suspicious transaction from new ...\" triggers high risk markers. Manual review recommended."
  }
}
```

### POST /agent

VeriPay backend invocation endpoint (called automatically by the backend during paid actions).

```bash
curl -X POST http://localhost:4101/agent \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "abc", "actionType": "API_LOOKUP", "actionIndex": 0, "input": "test", "customerWallet": "0x..."}'
```

## Configuration

| Env Variable | Default | Description |
|---|---|---|
| `PROVIDER_AGENT_PRIVATE_KEY` | *required* | Provider wallet private key |
| `PROVIDER_AGENT_PORT` | `4101` | HTTP server port |
| `PROVIDER_AGENT_ID` | `provider-risk-agent` | Agent identifier |
| `PROVIDER_AGENT_NAME` | `Risk Analysis Provider` | Display name |
| `PROVIDER_AGENT_PRICE_USDC` | `0.001` | Price per action in USDC |
| `VERIPAY_BACKEND_URL` | `http://localhost:3001` | VeriPay backend URL |

## Security

- Private key is loaded from `.env` only — never hardcoded or logged
- `.env` is gitignored — never committed
- Wallet address is derived at startup and displayed (safe to show)
- The provider never touches customer funds — VeriPay handles all settlement
