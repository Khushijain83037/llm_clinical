"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type RunSummary = {
  id: string; strategy: string; status: string;
  completed_cases: number; total_cases: number; prompt_hash: string;
  aggregate_scores?: { overall?: number; medications?: { f1?: number }; diagnoses?: { f1?: number }; plan?: { f1?: number } } | null;
  cost_usd?: number; tokens?: { cost_usd?: number }; wall_ms: number; created_at: string;
};

const SERVER = "https://modelapi.devchauhan.com";

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}`;
}

function ScorePill({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ color: "#9ca3af", fontSize: 13 }}>—</span>;
  const v = value * 100;
  const color = v >= 80 ? "#059669" : v >= 60 ? "#d97706" : "#dc2626";
  return <span style={{ color, fontFamily: "monospace", fontSize: 13, fontWeight: 600 }}>{pct(value)}%</span>;
}

const STRAT: Record<string, { label: string; color: string; dot: string }> = {
  zero_shot: { label: "Zero Shot", color: "#1d4ed8", dot: "#3b82f6" },
  few_shot: { label: "Few Shot", color: "#6d28d9", dot: "#8b5cf6" },
  cot: { label: "Chain of Thought", color: "#0e7490", dot: "#06b6d4" },
};

export default function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [strategy, setStrategy] = useState<"zero_shot" | "few_shot" | "cot">("few_shot");
  const [selected, setSelected] = useState<string[]>([]);

  const load = () => fetch(`${SERVER}/api/v1/runs`).then(r => r.json()).then(setRuns).catch(console.error).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const startRun = async () => {
    setStarting(true);
    await fetch(`${SERVER}/api/v1/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ strategy }) });
    await load();
    setStarting(false);
  };

  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s.slice(-1), id]);
  const getCost = (r: RunSummary) => r.tokens?.cost_usd ?? r.cost_usd ?? 0;
  const done = runs.filter(r => r.status === "completed");
  const bestF1 = done.length > 0 ? Math.max(...done.map(r => r.aggregate_scores?.overall ?? 0)) : 0;
  const totalCost = done.reduce((a, r) => a + getCost(r), 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; } tr.datarow:hover td { background: #f8fafc; }`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect width="20" height="20" rx="5" fill="#111827"/>
              <path d="M5 10h10M10 5v10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#111827", letterSpacing: -0.3 }}>HealOS Bench</span>
            <span style={{ color: "#e5e7eb" }}>·</span>
            <span style={{ fontSize: 13, color: "#6b7280" }}>Clinical Extraction Evaluator</span>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#9ca3af" }}>
            <span style={{ fontFamily: "monospace" }}>claude-haiku-4-5</span>
            <span>50 transcripts</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 32px" }}>

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Runs", value: String(runs.length), sub: `${done.length} completed` },
            { label: "Best F1", value: bestF1 > 0 ? `${pct(bestF1)}%` : "—", sub: "few_shot", accent: "#059669" },
            { label: "Total Cost", value: totalCost > 0 ? `$${totalCost.toFixed(3)}` : "$0.00", sub: "3 strategies" },
            { label: "Strategies", value: "3", sub: "zero · few · cot" },
          ].map(c => (
            <div key={c.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{c.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.accent ?? "#111827", letterSpacing: -0.5, lineHeight: 1 }}>{c.value}</div>
              <div style={{ fontSize: 11, color: "#d1d5db", marginTop: 5 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
            {(["zero_shot", "few_shot", "cot"] as const).map((s, i, arr) => (
              <button key={s} onClick={() => setStrategy(s)} style={{ padding: "7px 14px", background: strategy === s ? "#111827" : "transparent", color: strategy === s ? "#fff" : "#374151", fontSize: 12, fontWeight: strategy === s ? 600 : 400, cursor: "pointer", border: "none", borderRight: i < arr.length - 1 ? "1px solid #e5e7eb" : "none", transition: "all 0.12s" }}>
                {STRAT[s].label}
              </button>
            ))}
          </div>
          <button onClick={startRun} disabled={starting} style={{ padding: "7px 16px", background: starting ? "#f3f4f6" : "#111827", color: starting ? "#9ca3af" : "#fff", border: "1px solid transparent", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: starting ? "not-allowed" : "pointer" }}>
            {starting ? "Starting…" : "▶ Run"}
          </button>
          {selected.length === 2 && (
            <Link href={`/compare?a=${selected[0]}&b=${selected[1]}`} style={{ padding: "7px 14px", background: "#faf5ff", color: "#7c3aed", border: "1px solid #e9d5ff", borderRadius: 8, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
              Compare
            </Link>
          )}
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>{selected.length}/2 selected for compare</span>
        </div>

        {/* Table */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
                {["", "Strategy", "Status", "Cases", "Overall", "Meds", "Diagnoses", "Plan", "Cost", "Time"].map(h => (
                  <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 11, color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>Loading runs...</td></tr>
              ) : runs.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: 56, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                  No runs yet.<br /><span style={{ fontSize: 12, color: "#d1d5db" }}>Select a strategy above and click Run to start.</span>
                </td></tr>
              ) : runs.map((r, i) => {
                const s = STRAT[r.strategy] ?? { label: r.strategy, color: "#374151", dot: "#9ca3af" };
                const isSel = selected.includes(r.id);
                const sc = r.status === "completed" ? { bg: "#f0fdf4", tx: "#166534", bd: "#bbf7d0" }
                  : r.status === "running" ? { bg: "#eff6ff", tx: "#1e40af", bd: "#bfdbfe" }
                  : r.status === "failed" ? { bg: "#fef2f2", tx: "#991b1b", bd: "#fecaca" }
                  : { bg: "#fffbeb", tx: "#92400e", bd: "#fde68a" };
                return (
                  <tr key={r.id} className="datarow" style={{ borderBottom: i < runs.length - 1 ? "1px solid #f3f4f6" : "none", background: isSel ? "#faf5ff" : "#fff" }}>
                    <td style={{ padding: "12px 14px" }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggle(r.id)} style={{ cursor: "pointer", accentColor: "#7c3aed", width: 14, height: 14 }} />
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <Link href={`/runs/${r.id}`} style={{ textDecoration: "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: s.dot, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.label}</div>
                            <div style={{ fontSize: 10, color: "#d1d5db", fontFamily: "monospace" }}>{r.prompt_hash}</div>
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 5, background: sc.bg, color: sc.tx, border: `1px solid ${sc.bd}` }}>{r.status}</span>
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 44, height: 3, background: "#f3f4f6", borderRadius: 2 }}>
                          <div style={{ width: `${(r.completed_cases / (r.total_cases || 50)) * 100}%`, height: "100%", background: s.dot, borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{r.completed_cases}/{r.total_cases}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 14px" }}><ScorePill value={r.aggregate_scores?.overall} /></td>
                    <td style={{ padding: "12px 14px" }}><ScorePill value={r.aggregate_scores?.medications?.f1} /></td>
                    <td style={{ padding: "12px 14px" }}><ScorePill value={r.aggregate_scores?.diagnoses?.f1} /></td>
                    <td style={{ padding: "12px 14px" }}><ScorePill value={r.aggregate_scores?.plan?.f1} /></td>
                    <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 12, color: "#374151" }}>${getCost(r).toFixed(4)}</td>
                    <td style={{ padding: "12px 14px", fontFamily: "monospace", fontSize: 12, color: "#9ca3af" }}>{(r.wall_ms / 1000).toFixed(1)}s</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}