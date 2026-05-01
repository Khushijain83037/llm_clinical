import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@test-evals/db";
import { runs, caseResults } from "@test-evals/db/schema";
import { startRun, resumeRun, getRuns, getRun, subscribe } from "../services/runner.service.js";
import { loadDataset, getCase } from "../services/dataset.service.js";
import type { PromptStrategy } from "@test-evals/shared";

const router = new Hono();

const StartRunSchema = z.object({
  strategy: z.enum(["zero_shot", "few_shot", "cot"]),
  model: z.string().optional(),
  dataset_filter: z.array(z.string()).optional(),
  force: z.boolean().optional(),
});

// POST /api/v1/runs
router.post("/", async (c) => {
  const body = await c.req.json();
  const parsed = StartRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const run_id = await startRun(parsed.data);
  return c.json({ run_id, cached: false }, 201);
});

// GET /api/v1/runs
router.get("/", async (c) => {
  const list = await getRuns();
  return c.json(list);
});

// GET /api/v1/runs/:id
router.get("/:id", async (c) => {
  const run = await getRun(c.req.param("id"));
  if (!run) return c.json({ error: "not found" }, 404);
  return c.json(run);
});

// POST /api/v1/runs/:id/resume
router.post("/:id/resume", async (c) => {
  const id = c.req.param("id");
  await resumeRun(id);
  return c.json({ ok: true });
});

// GET /api/v1/runs/:id/stream — SSE progress
router.get("/:id/stream", async (c) => {
  const id = c.req.param("id");
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");

  return stream(c, async (s) => {
    await new Promise<void>((resolve) => {
      const unsub = subscribe(id, async (msg) => {
        try {
          await s.write(msg);
          if (msg.includes('"type":"complete"') || msg.includes('"type":"error"')) {
            unsub();
            resolve();
          }
        } catch {
          unsub();
          resolve();
        }
      });

      // Heartbeat every 15s
      const hb = setInterval(async () => {
        try { await s.write(": heartbeat\n\n"); } catch { clearInterval(hb); }
      }, 15_000);

      s.onAbort(() => { unsub(); clearInterval(hb); resolve(); });
    });
  });
});

// GET /api/v1/runs/:runId/cases/:transcriptId
router.get("/:runId/cases/:transcriptId", async (c) => {
  const runId = c.req.param("runId");
  const transcriptId = c.req.param("transcriptId");

  const cr = await db.query.caseResults.findFirst({
    where: (t, { and, eq }) => and(eq(t.run_id, runId), eq(t.transcript_id, transcriptId)),
  });
  if (!cr) return c.json({ error: "not found" }, 404);

  const dc = getCase(transcriptId);

  return c.json({
    ...cr,
    transcript: dc?.transcript ?? "",
    gold: dc?.gold ?? null,
  });
});

// GET /api/v1/compare?a=:runIdA&b=:runIdB
// (mounted at /api/v1/compare via index)

export default router;
