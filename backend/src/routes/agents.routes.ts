import { Router } from "express";
import { getAllAgents, getAllProviders, getAllCustomers, getAgentById, registerProvider, registerCustomer } from "../services/agent.service";
import { getPriceTable } from "../services/pricing.service";

const router = Router();

// GET /api/agents — list all active agents
router.get("/", (_req, res) => {
  const agents = getAllAgents();
  res.json(agents.map((a) => ({
    ...a,
    priceTable: a.role === "provider" ? getPriceTable(a.id) : undefined,
    apiKeyHash: undefined, // never expose
    privateKey: undefined, // never expose
  })));
});

// GET /api/agents/providers — list provider agents only
router.get("/providers", (_req, res) => {
  const providers = getAllProviders();
  res.json(providers.map((a) => ({
    ...a,
    priceTable: getPriceTable(a.id),
    apiKeyHash: undefined,
    privateKey: undefined,
  })));
});

// GET /api/agents/customers — list customer agents only
router.get("/customers", (_req, res) => {
  const customers = getAllCustomers();
  res.json(customers.map((a) => ({
    ...a,
    apiKeyHash: undefined,
    privateKey: undefined,
  })));
});

// GET /api/agents/:id — single agent detail
router.get("/:id", (req, res) => {
  const agent = getAgentById(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: "Agent not found" });
  }
  res.json({
    ...agent,
    priceTable: agent.role === "provider" ? getPriceTable(agent.id) : undefined,
    apiKeyHash: undefined,
    privateKey: undefined,
  });
});

// POST /api/agents/providers/register — register a provider agent
router.post("/providers/register", (req, res) => {
  try {
    const { name, walletAddress, endpoint, supportedActions, pricing, description, mode, capabilities } = req.body;

    if (!name || !walletAddress || !endpoint || !supportedActions?.length || !pricing?.length) {
      return res.status(400).json({
        error: "Missing required fields: name, walletAddress, endpoint, supportedActions, pricing",
      });
    }

    const result = registerProvider({
      name, walletAddress, endpoint, supportedActions, pricing, description, mode, capabilities,
    });

    res.json({
      agent: { ...result.agent, apiKeyHash: undefined, privateKey: undefined },
      apiKey: result.apiKey,
      message: "Provider registered. Save your API key — it will not be shown again.",
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/agents/customers/register — register a customer agent
router.post("/customers/register", (req, res) => {
  try {
    const { name, walletAddress, privateKey, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Missing required field: name" });
    }

    const result = registerCustomer({ name, walletAddress, privateKey, description });

    res.json({
      agent: { ...result.agent, apiKeyHash: undefined, privateKey: undefined },
      apiKey: result.apiKey,
      walletAddress: result.walletAddress,
      // Only show private key if it was generated (not user-provided)
      generatedPrivateKey: !walletAddress ? result.privateKey : undefined,
      message: !walletAddress
        ? "Customer registered with generated wallet. Save your API key and private key — they will not be shown again."
        : "Customer registered. Save your API key — it will not be shown again.",
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
