import { auth } from "@test-evals/auth";
import { env } from "@test-evals/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { getRun } from "./services/runner.service.js";
import { loadDataset } from "./services/dataset.service.js";
import runsRouter from "./routes/runs.js";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", (c) => c.text("OK"));

// Eval API
app.route("/api/v1/runs", runsRouter);

// Compare two runs
app.get("/api/v1/compare", async (c) => {
  const a = c.req.query("a");
  const b = c.req.query("b");
  if (!a || !b) return c.json({ error: "a and b run IDs required" }, 400);
  const [runA, runB] = await Promise.all([getRun(a), getRun(b)]);
  if (!runA || !runB) return c.json({ error: "one or both runs not found" }, 404);
  return c.json({ runA, runB });
});

// Dataset info
app.get("/api/v1/dataset", (c) => {
  const cases = loadDataset();
  return c.json({ count: cases.length, ids: cases.map((dc) => dc.id) });
});

export default app;
