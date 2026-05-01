"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const SERVER = "https://modelapi.devchauhan.com";

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function delta(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return null;
  return b - a;
}

const STRAT: Record<string, string> = {
  zero_shot: "Zero Shot",
  few_shot: "Few Shot",
  cot: "Chain of Thought",
};

function DeltaCell({ d }: { d: number | null }) {
  if (d === null) return <td style={{ padding: "9px 14px", color: "#9ca3af", fontFamily: "monospace", fontSize: 12 }}>—</td>;
  const sign = d > 0 ? "+" : "";
  const color = d > 0.02 ? "#059669" : d < -0.02 ? "#dc2626" : "#6b7280";
  const fw = Math.abs(d) > 0.02 ? 700 : 400;
  return <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color, fontWeight: fw }}>{sign}{(d * 100).toFixed(1)}%</td>;
}

function winner(a: number | null | undefined, b: number | null | undefined): "A" | "B" | "tie" | null {
  if (a == null || b == null) return null;
  if (Math.abs(b - a) < 0.01) return "tie";
  return b > a ? "B" : "A";
}

type RunData = {
  id: string; strategy: string; prompt_hash: string; status: string;
  completed_cases: number; total_cases: number; wall_ms: number;
  cost_usd?: number; tokens?: { cost_usd?: number; cache_read?: number };
  aggregate_scores?: {
    overall?: number; chief_complaint?: number;
    vitals?: { avg?: number; bp?: number; hr?: number; temp_f?: number; spo2?: number };
    medications?: { f1?: number; precision?: number; recall?: number };
    diagnoses?: { f1?: number; precision?: number; recall?: number };
    plan?: { f1?: number; precision?: number; recall?: number };
    follow_up_interval?: number; follow_up_reason?: number;
  } | null;
  cases?: { transcript_id: string; scores?: { overall?: number; medications?: { f1?: number }; plan?: { f1?: number }; diagnoses?: { f1?: number } } | null }[];
};

function getFields(a: RunData["aggregate_scores"], b: RunData["aggregate_scores"]) {
  return [
    { label: "Overall F1", a: a?.overall, b: b?.overall, bold: true },
    { label: "Chief Complaint", a: a?.chief_complaint, b: b?.chief_complaint },
    { label: "Vitals (avg)", a: a?.vitals?.avg, b: b?.vitals?.avg },
    { label: "  BP", a: a?.vitals?.bp, b: b?.vitals?.bp },
    { label: "  HR", a: a?.vitals?.hr, b: b?.vitals?.hr },
    { label: "  Temp", a: a?.vitals?.temp_f, b: b?.vitals?.temp_f },
    { label: "  SpO2", a: a?.vitals?.spo2, b: b?.vitals?.spo2 },
    { label: "Medications F1", a: a?.medications?.f1, b: b?.medications?.f1 },
    { label: "  Precision", a: a?.medications?.precision, b: b?.medications?.precision },
    { label: "  Recall", a: a?.medications?.recall, b: b?.medications?.recall },
    { label: "Diagnoses F1", a: a?.diagnoses?.f1, b: b?.diagnoses?.f1 },
    { label: "  Precision", a: a?.diagnoses?.precision, b: b?.diagnoses?.precision },
    { label: "  Recall", a: a?.diagnoses?.recall, b: b?.diagnoses?.recall },
    { label: "Plan F1", a: a?.plan?.f1, b: b?.plan?.f1 },
    { label: "  Precision", a: a?.plan?.precision, b: b?.plan?.precision },
    { label: "  Recall", a: a?.plan?.recall, b: b?.plan?.recall },
    { label: "Follow-up Days", a: a?.follow_up_interval, b: b?.follow_up_interval },
    { label: "Follow-up Reason", a: a?.follow_up_reason, b: b?.follow_up_reason },
  ];
}

function CompareContent() {
  const params = useSearchParams();
  const aId = params.get("a");
  const bId = params.get("b");
  const [runA, setRunA] = useState<RunData | null>(null);
  const [runB, setRunB] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!aId || !bId) return;
    setLoading(true);
    Promise.all([
      fetch(`${SERVER}/api/v1/runs/${aId}`).then(r => r.json()),
      fetch(`${SERVER}/api/v1/runs/${bId}`).then(r => r.json()),
    ]).then(([a, b]) => { setRunA(a); setRunB(b); })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [aId, bId]);

  if (!aId || !bId) return (
    <div style={{ padding: "40px 32px", fontFamily: "system-ui", color: "#374151" }}>
      <p>Select two runs from <Link href="/runs" style={{ color: "#2563eb" }}>the runs list</Link> to compare.</p>
    </div>
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontFamily: "system-ui", fontSize: 13 }}>Loading comparison…</div>;
  if (error || !runA || !runB) return <div style={{ padding: 40, color: "#dc2626", fontFamily: "system-ui", fontSize: 13 }}>Failed to load: {error}</div>;

  const fields = getFields(runA.aggregate_scores, runB.aggregate_scores);
  const aWins = fields.filter(f => winner(f.a, f.b) === "A").length;
  const bWins = fields.filter(f => winner(f.a, f.b) === "B").length;
  const getCost = (r: RunData) => r.tokens?.cost_usd ?? r.cost_usd ?? 0;

  const cases = [...new Set([
    ...(runA.cases ?? []).map(c => c.transcript_id),
    ...(runB.cases ?? []).map(c => c.transcript_id),
  ])].sort();
  const mapA = new Map((runA.cases ?? []).map(c => [c.transcript_id, c]));
  const mapB = new Map((runB.cases ?? []).map(c => [c.transcript_id, c]));

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; }`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px", height: 52, display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/runs" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none" }}>← Runs</Link>
          <span style={{ color: "#e5e7eb" }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>Compare</span>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>{STRAT[runA.strategy] ?? runA.strategy} vs {STRAT[runB.strategy] ?? runB.strategy}</span>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 32px" }}>

        {/* Run cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          {([["A", runA, "#1d4ed8", "#eff6ff", "#bfdbfe"], ["B", runB, "#059669", "#f0fdf4", "#bbf7d0"]] as const).map(([label, run, color, bg, bd]) => (
            <div key={label} style={{ background: bg, border: `1px solid ${bd}`, borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, background: color, color: "#fff", padding: "2px 8px", borderRadius: 4 }}>{label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color }}>{STRAT[run.strategy] ?? run.strategy}</span>
                </div>
                <Link href={`/runs/${run.id}`} style={{ fontSize: 11, color, textDecoration: "none" }}>View run →</Link>
              </div>
              <div style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", marginBottom: 10 }}>{run.prompt_hash}</div>
              <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
                <span style={{ color: "#374151" }}>F1: <strong style={{ color, fontSize: 16 }}>{pct(run.aggregate_scores?.overall)}</strong></span>
                <span style={{ color: "#6b7280" }}>Cost: <strong>${getCost(run).toFixed(4)}</strong></span>
                <span style={{ color: "#6b7280" }}>{run.completed_cases}/{run.total_cases} cases</span>
                <span style={{ color: "#6b7280" }}>{(run.wall_ms / 1000).toFixed(1)}s</span>
              </div>
            </div>
          ))}
        </div>

        {/* Winner summary */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 18px", marginBottom: 16, display: "flex", gap: 24, fontSize: 13, color: "#374151" }}>
          <span>Field wins: <strong style={{ color: "#1d4ed8" }}>A: {aWins}</strong> vs <strong style={{ color: "#059669" }}>B: {bWins}</strong></span>
          <span>Overall winner: <strong>{aWins > bWins ? `A — ${STRAT[runA.strategy]}` : bWins > aWins ? `B — ${STRAT[runB.strategy]}` : "Tie"}</strong></span>
        </div>

        {/* Field comparison table */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #f3f4f6" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Field-level Comparison</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
                {["Field", "A", "B", "Δ (B−A)", "Winner"].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fields.map((row, i) => {
                const d = delta(row.a, row.b);
                const w = winner(row.a, row.b);
                const isMain = !row.label.startsWith("  ") && row.label !== "Overall F1";
                const bg = row.bold ? "#fffbeb" : isMain ? "#fafafa" : "#fff";
                return (
                  <tr key={i} style={{ borderBottom: "1px solid #f9fafb", background: bg }}>
                    <td style={{ padding: "9px 14px", fontSize: row.bold ? 13 : row.label.startsWith("  ") ? 11 : 12, color: "#374151", fontWeight: row.bold ? 700 : 400, paddingLeft: row.label.startsWith("  ") ? 28 : 14 }}>{row.label.trim()}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: "#1d4ed8", fontWeight: row.bold ? 700 : 400 }}>{pct(row.a)}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: 12, color: "#059669", fontWeight: row.bold ? 700 : 400 }}>{pct(row.b)}</td>
                    <DeltaCell d={d} />
                    <td style={{ padding: "9px 14px", fontSize: 11 }}>
                      {w === "tie" ? <span style={{ color: "#9ca3af" }}>tie</span>
                        : w === "A" ? <span style={{ color: "#1d4ed8", fontWeight: 600 }}>A wins</span>
                        : w === "B" ? <span style={{ color: "#059669", fontWeight: 600 }}>B wins</span>
                        : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Per-case breakdown */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #f3f4f6" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Per-case Breakdown</span>
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8 }}>green = B better by 5pp+, red = A better</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
                  {["Case", "A Overall", "B Overall", "Δ", "A Meds", "B Meds", "A Dx", "B Dx", "A Plan", "B Plan"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((tid, i) => {
                  const ca = mapA.get(tid);
                  const cb = mapB.get(tid);
                  const d = delta(ca?.scores?.overall, cb?.scores?.overall);
                  const bg = d != null && d > 0.05 ? "#f0fdf4" : d != null && d < -0.05 ? "#fef2f2" : i % 2 === 0 ? "#fff" : "#fafafa";
                  return (
                    <tr key={tid} style={{ borderBottom: "1px solid #f9fafb", background: bg }}>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#374151" }}>{tid}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#1d4ed8" }}>{pct(ca?.scores?.overall)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#059669" }}>{pct(cb?.scores?.overall)}</td>
                      <DeltaCell d={d} />
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#1d4ed8" }}>{pct(ca?.scores?.medications?.f1)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#059669" }}>{pct(cb?.scores?.medications?.f1)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#1d4ed8" }}>{pct(ca?.scores?.diagnoses?.f1)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#059669" }}>{pct(cb?.scores?.diagnoses?.f1)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#1d4ed8" }}>{pct(ca?.scores?.plan?.f1)}</td>
                      <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: 11, color: "#059669" }}>{pct(cb?.scores?.plan?.f1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontFamily: "system-ui", fontSize: 13 }}>Loading…</div>}>
      <CompareContent />
    </Suspense>
  );
}