#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# VeriPay Loop — Local Demo Deploy Script
# Deploys all contracts to Anvil and writes backend/.env automatically
# ─────────────────────────────────────────────────────────────────────────────

set -e

# Anvil default account #0 — this is a publicly known test key from Foundry.
# It is NOT a real secret. It only works on local Anvil instances.
# See: https://book.getfoundry.sh/reference/anvil/
# DO NOT use this key on any real network or testnet with real funds.
DEPLOYER_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
RPC_URL="http://127.0.0.1:8545"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONTRACTS_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$(dirname "$CONTRACTS_DIR")/backend"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  VeriPay Loop — Local Demo Deploy"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── 1. Check Anvil ──────────────────────────────────────────────────────
echo "▸ Checking Anvil at $RPC_URL ..."
if ! curl -s -X POST --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  -H "Content-Type: application/json" "$RPC_URL" > /dev/null 2>&1; then
  echo ""
  echo "  ✗ Anvil is not running."
  echo "  Start it first:  anvil"
  echo ""
  exit 1
fi
echo "  ✓ Anvil is running"
echo ""

# ── 2. Deploy contracts ────────────────────────────────────────────────
echo "▸ Deploying contracts..."
cd "$CONTRACTS_DIR"

DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol:DeployScript \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" \
  --broadcast \
  -vvv 2>&1)

echo "$DEPLOY_OUTPUT" | grep -E "(MockUSDC|UsageMeter|NanoSettlement|AgentRegistry|Minted)" || true
echo ""

# ── 3. Parse addresses ─────────────────────────────────────────────────
USDC_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "MockUSDC:" | awk '{print $NF}')
METER_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "UsageMeter:" | awk '{print $NF}')
SETTLEMENT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "NanoSettlement:" | awk '{print $NF}')
REGISTRY_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "AgentRegistry:" | awk '{print $NF}')

if [ -z "$USDC_ADDRESS" ] || [ -z "$METER_ADDRESS" ] || [ -z "$SETTLEMENT_ADDRESS" ] || [ -z "$REGISTRY_ADDRESS" ]; then
  echo "  ✗ Failed to parse contract addresses from deploy output."
  echo "  Raw output:"
  echo "$DEPLOY_OUTPUT"
  exit 1
fi

echo "  Deployed Addresses:"
echo "  ├─ MockUSDC:         $USDC_ADDRESS"
echo "  ├─ UsageMeter:       $METER_ADDRESS"
echo "  ├─ NanoSettlement:   $SETTLEMENT_ADDRESS"
echo "  └─ AgentRegistry:    $REGISTRY_ADDRESS"
echo ""

# ── 4. Write backend/.env ──────────────────────────────────────────────
ENV_FILE="$BACKEND_DIR/.env"
echo "▸ Writing $ENV_FILE ..."

cat > "$ENV_FILE" <<EOF
PORT=3001
ARC_RPC_URL=$RPC_URL
OPERATOR_PRIVATE_KEY=$DEPLOYER_KEY
USAGE_METER_ADDRESS=$METER_ADDRESS
NANO_SETTLEMENT_ADDRESS=$SETTLEMENT_ADDRESS
AGENT_REGISTRY_ADDRESS=$REGISTRY_ADDRESS
USDC_ADDRESS=$USDC_ADDRESS
EOF

echo "  ✓ backend/.env written"
echo ""

# ── 5. Write frontend/.env.local ───────────────────────────────────────
FRONTEND_DIR="$(dirname "$CONTRACTS_DIR")/frontend"
FRONTEND_ENV="$FRONTEND_DIR/.env.local"
echo "▸ Writing $FRONTEND_ENV ..."

cat > "$FRONTEND_ENV" <<EOF
NEXT_PUBLIC_ARC_RPC_URL=$RPC_URL
NEXT_PUBLIC_USAGE_METER_ADDRESS=$METER_ADDRESS
NEXT_PUBLIC_NANO_SETTLEMENT_ADDRESS=$SETTLEMENT_ADDRESS
NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS=$REGISTRY_ADDRESS
NEXT_PUBLIC_USDC_ADDRESS=$USDC_ADDRESS
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
EOF

echo "  ✓ frontend/.env.local written"
echo ""

# ── Done ───────────────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════"
echo "  ✓ Deploy complete — all contracts live on Anvil"
echo ""
echo "  Next steps:"
echo "    1. cd backend && npm run dev"
echo "    2. cd frontend && npm run dev"
echo "    3. Open http://localhost:3000/loop"
echo "    4. Click 'Run Demo' → watch 100 onchain settlements"
echo "═══════════════════════════════════════════════════════"
echo ""
