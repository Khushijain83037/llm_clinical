"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
export const dynamic = "force-dynamic";

const SERVER = "https://modelapi.devchauhan.com";

type CaseRow = {
  transcript_id: string; schema_valid: boolean; attempt_count: number;
  scores?: { overall?: number; chief_complaint?: number; vitals?: { avg?: number }; medications?: { f1?: number }; diagnoses?: { f1?: number }; plan?: { f1?: number } } | null;
};

type RunData = {
  id: string; strategy: string; status: string; prompt_hash: string;
  completed_cases: number; total_cases: number;
  cost_usd?: number; tokens?: { cost_usd?: number }; wall_ms: number;
  aggregate_scores?: {
    overall?: number; chief_complaint?: number; vitals?: { avg?: number };
    medications?: { f1?: number; precision?: number; recall?: number };
    diagnoses?: { f1?: number; precision?: number; recall?: number };
    plan?: { f1?: number; precision?: number; recall?: number };
    follow_up_interval?: number; follow_up_reason?: number;
  } | null;
  cases?: CaseRow[];
};

const STRAT: Record<string, { label: string; color: string }> = {
  zero_shot: { label: "Zero Shot", color: "#1d4ed8" },
  few_shot: { label: "Few Shot", color: "#6d28d9" },
  cot: { label: "Chain of Thought", color: "#0e7490" },
};

function pct(n: number | null | undefined) { if (n == null) return "—"; return `${(n * 100).toFixed(1)}%`; }

function Score({ value, size = "sm" }: { value: number | null | undefined; size?: "sm" | "lg" }) {
  if (value == null) return <span style={{ color: "#9ca3af" }}>—</span>;
  const v = value * 100;
  const color = v >= 80 ? "#059669" : v >= 60 ? "#d97706" : "#dc2626";
  if (size === "lg") return <span style={{ color, fontFamily: "monospace", fontSize: 32, fontWeight: 700 }}>{v.toFixed(1)}%</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 36, height: 3, background: "#f3f4f6", borderRadius: 2 }}>
        <div style={{ width: `${v}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ color, fontFamily: "monospace", fontSize: 12, fontWeight: 600, minWidth: 40 }}>{v.toFixed(1)}%</span>
    </div>
  );
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [gold, setGold] = useState("");
  const [pred, setPred] = useState("");
  const [caseLoading, setCaseLoading] = useState(false);

  useEffect(() => {
    fetch(`${SERVER}/api/v1/runs/${id}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: RunData) => setRun({ ...d, cases: (d.cases ?? []).map(c => ({ transcript_id: c.transcript_id, schema_valid: c.schema_valid, attempt_count: c.attempt_count, scores: c.scores })) }))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!sel) return;
    setCaseLoading(true);
    setGold(""); setPred("");
    fetch(`${SERVER}/api/v1/runs/${id}/cases/${sel}`)
      .then(r => r.json())
      .then((d: { gold?: unknown; prediction?: unknown }) => { setGold(JSON.stringify(d.gold, null, 2)); setPred(JSON.stringify(d.prediction, null, 2)); })
      .catch(console.error)
      .finally(() => setCaseLoading(false));
  }, [sel, id]);

  if (loading) return <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 13, fontFamily: "system-ui" }}>Loading run…</div>;
  if (error) return <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", color: "#dc2626", fontSize: 13, fontFamily: "system-ui" }}>{error}</div>;
  if (!run) return null;

  const cases = [...(run.cases ?? [])].sort((a, b) => a.transcript_id.localeCompare(b.transcript_id));
  const s = STRAT[run.strategy] ?? { label: run.strategy, color: "#374151" };
  const cost = run.tokens?.cost_usd ?? run.cost_usd ?? 0;
  const agg = run.aggregate_scores;

  const fields = [
    { label: "Chief Complaint", v: agg?.chief_complaint },
    { label: "Vitals", v: agg?.vitals?.avg },
    { label: "Medications", v: agg?.medications?.f1, p: agg?.medications?.precision, r: agg?.medications?.recall },
    { label: "Diagnoses", v: agg?.diagnoses?.f1, p: agg?.diagnoses?.precision, r: agg?.diagnoses?.recall },
    { label: "Plan", v: agg?.plan?.f1, p: agg?.plan?.precision, r: agg?.plan?.recall },
    { label: "Follow-up Days", v: agg?.follow_up_interval },
    { label: "Follow-up Reason", v: agg?.follow_up_reason },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`* { box-sizing: border-box; } body { margin: 0; } tr.crow:hover td { background: #f8fafc !important; cursor: pointer; }`}</style>

      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "0 32px", height: 52, display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/runs" style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
            ← Runs
          </Link>
          <span style={{ color: "#e5e7eb" }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.label}</span>
          <span style={{ fontSize: 11, color: "#d1d5db", fontFamily: "monospace" }}>{run.prompt_hash}</span>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: run.status === "completed" ? "#f0fdf4" : "#eff6ff", color: run.status === "completed" ? "#166534" : "#1e40af", border: `1px solid ${run.status === "completed" ? "#bbf7d0" : "#bfdbfe"}` }}>{run.status}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#9ca3af" }}>{run.completed_cases}/{run.total_cases} cases · {(run.wall_ms / 1000).toFixed(1)}s · ${cost.toFixed(4)}</span>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 32px" }}>

        {/* Score + breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 14, marginBottom: 20 }}>
          {/* Big score */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Overall F1</div>
            <Score value={agg?.overall} size="lg" />
            <div style={{ width: "100%", height: 4, background: "#f3f4f6", borderRadius: 2, marginTop: 14 }}>
              <div style={{ width: `${(agg?.overall ?? 0) * 100}%`, height: "100%", background: s.color, borderRadius: 2 }} />
            </div>
          </div>

          {/* Field breakdown */}
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "20px 24px" }}>
            <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 16 }}>Field Breakdown</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 32px" }}>
              {fields.map(f => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{f.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {"p" in f && f.p != null && <span style={{ fontSize: 10, color: "#d1d5db" }}>P:{pct(f.p)} R:{pct(f.r)}</span>}
                    <Score value={f.v} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cases table */}
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", marginBottom: sel ? 2 : 0 }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Case Results</span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>{cases.length} cases · click to inspect</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
                  {["Case", "Overall", "Chief CC", "Vitals", "Meds", "Dx", "Plan", "Valid"].map(h => (
                    <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 11, color: "#6b7280", fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.4 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((c, i) => {
                  const sc = c.scores;
                  const isSel = sel === c.transcript_id;
                  return (
                    <tr key={c.transcript_id} className="crow" onClick={() => setSel(isSel ? null : c.transcript_id)}
                      style={{ borderBottom: i < cases.length - 1 ? "1px solid #f9fafb" : "none", background: isSel ? "#faf5ff" : "#fff", borderLeft: isSel ? `3px solid ${s.color}` : "3px solid transparent" }}>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: isSel ? s.color : "#374151", fontWeight: isSel ? 600 : 400 }}>{c.transcript_id}</td>
                      <td style={{ padding: "10px 14px" }}><Score value={sc?.overall} /></td>
                      <td style={{ padding: "10px 14px" }}><Score value={sc?.chief_complaint} /></td>
                      <td style={{ padding: "10px 14px" }}><Score value={sc?.vitals?.avg} /></td>
                      <td style={{ padding: "10px 14px" }}><Score value={sc?.medications?.f1} /></td>
                      <td style={{ padding: "10px 14px" }}><Score value={sc?.diagnoses?.f1} /></td>
                      <td style={{ padding: "10px 14px" }}><Score value={sc?.plan?.f1} /></td>
                      <td style={{ padding: "10px 14px", fontSize: 14 }}>{c.schema_valid ? <span style={{ color: "#059669" }}>✓</span> : <span style={{ color: "#dc2626" }}>✗</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Case detail */}
        {sel && (
          <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderTop: `3px solid ${s.color}`, borderRadius: "0 0 10px 10px", overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid #f3f4f6", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: s.color }}>{sel}</span>
              <span style={{ fontSize: 11, color: "#9ca3af" }}>Gold vs Prediction</span>
              <button onClick={() => setSel(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#9ca3af", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
            </div>
            {caseLoading ? (
              <div style={{ padding: 32, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>Loading…</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                <div style={{ borderRight: "1px solid #f3f4f6", padding: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#059669", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Gold</div>
                  <pre style={{ margin: 0, fontSize: 11, color: "#374151", lineHeight: 1.7, overflowX: "auto", maxHeight: 360, background: "#f9fafb", padding: 12, borderRadius: 6, border: "1px solid #f3f4f6" }}>{gold}</pre>
                </div>
                <div style={{ padding: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: s.color, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 10 }}>Prediction</div>
                  <pre style={{ margin: 0, fontSize: 11, color: "#374151", lineHeight: 1.7, overflowX: "auto", maxHeight: 360, background: "#f9fafb", padding: 12, borderRadius: 6, border: "1px solid #f3f4f6" }}>{pred}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}