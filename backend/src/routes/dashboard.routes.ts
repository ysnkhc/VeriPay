import { Router } from "express";
import { getDashboardMetrics } from "../services/metrics.service";
import { getTxFeed } from "../services/session.service";

const router = Router();

// GET /api/dashboard — aggregate stats for frontend metrics page
router.get("/", (_req, res) => {
  const metrics = getDashboardMetrics();
  res.json(metrics);
});

// GET /api/tx-feed — latest action settlements for live feed
router.get("/tx-feed", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const feed = getTxFeed(limit);
  res.json(feed);
});

export default router;
