"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import type { RunDetail, FieldScores, CaseResult } from "@test-evals/shared";

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function delta(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return null;
  return b - a;
}

function DeltaCell({ d }: { d: number | null }) {
  if (d === null) return <td className="py-2 px-3 text-gray-400">—</td>;
  const sign = d > 0 ? "+" : "";
  const color = d > 0.02 ? "text-green-700 font-bold" : d < -0.02 ? "text-red-600 font-bold" : "text-gray-500";
  return (
    <td className={`py-2 px-3 font-mono ${color}`}>
      {sign}{(d * 100).toFixed(1)}%
    </td>
  );
}

function WinnerBadge({ winner }: { winner: "A" | "B" | "tie" | null }) {
  if (!winner) return null;
  if (winner === "tie") return <span className="text-xs text-gray-400 ml-1">tie</span>;
  return (
    <span className={`text-xs font-bold ml-1 ${winner === "B" ? "text-green-700" : "text-blue-700"}`}>
      ← {winner === "B" ? "B wins" : "A wins"}
    </span>
  );
}

type FieldRow = {
  label: string;
  a: number | null | undefined;
  b: number | null | undefined;
  key: string;
};

function getRows(a: FieldScores | null, b: FieldScores | null): FieldRow[] {
  return [
    { key: "overall", label: "Overall F1 ⭐", a: a?.overall, b: b?.overall },
    { key: "chief_complaint", label: "Chief Complaint", a: a?.chief_complaint, b: b?.chief_complaint },
    { key: "vitals_avg", label: "Vitals (avg)", a: a?.vitals.avg, b: b?.vitals.avg },
    { key: "vitals_bp", label: "  ↳ BP", a: a?.vitals.bp, b: b?.vitals.bp },
    { key: "vitals_hr", label: "  ↳ HR", a: a?.vitals.hr, b: b?.vitals.hr },
    { key: "vitals_temp", label: "  ↳ Temp", a: a?.vitals.temp_f, b: b?.vitals.temp_f },
    { key: "vitals_spo2", label: "  ↳ SpO2", a: a?.vitals.spo2, b: b?.vitals.spo2 },
    { key: "meds_f1", label: "Medications F1", a: a?.medications.f1, b: b?.medications.f1 },
    { key: "meds_p", label: "  ↳ Precision", a: a?.medications.precision, b: b?.medications.precision },
    { key: "meds_r", label: "  ↳ Recall", a: a?.medications.recall, b: b?.medications.recall },
    { key: "dx_f1", label: "Diagnoses F1", a: a?.diagnoses.f1, b: b?.diagnoses.f1 },
    { key: "dx_p", label: "  ↳ Precision", a: a?.diagnoses.precision, b: b?.diagnoses.precision },
    { key: "dx_r", label: "  ↳ Recall", a: a?.diagnoses.recall, b: b?.diagnoses.recall },
    { key: "plan_f1", label: "Plan F1", a: a?.plan.f1, b: b?.plan.f1 },
    { key: "fu_days", label: "Follow-up Days", a: a?.follow_up_interval, b: b?.follow_up_interval },
    { key: "fu_reason", label: "Follow-up Reason", a: a?.follow_up_reason, b: b?.follow_up_reason },
  ];
}

function winner(a: number | null | undefined, b: number | null | undefined): "A" | "B" | "tie" | null {
  if (a == null || b == null) return null;
  const d = b - a;
  if (Math.abs(d) < 0.01) return "tie";
  return d > 0 ? "B" : "A";
}

function CaseCompareTable({ casesA, casesB }: { casesA: CaseResult[]; casesB: CaseResult[] }) {
  const mapA = new Map(casesA.map((c) => [c.transcript_id, c]));
  const mapB = new Map(casesB.map((c) => [c.transcript_id, c]));
  const ids = [...new Set([...mapA.keys(), ...mapB.keys()])].sort();

  return (
    <div className="overflow-x-auto mt-4">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-1.5 pr-3">Case</th>
            <th className="py-1.5 pr-3 text-blue-700">A Overall</th>
            <th className="py-1.5 pr-3 text-green-700">B Overall</th>
            <th className="py-1.5 pr-3">Δ</th>
            <th className="py-1.5 pr-3 text-blue-700">A Meds</th>
            <th className="py-1.5 pr-3 text-green-700">B Meds</th>
            <th className="py-1.5 pr-3 text-blue-700">A Plan</th>
            <th className="py-1.5 pr-3 text-green-700">B Plan</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((tid) => {
            const ca = mapA.get(tid);
            const cb = mapB.get(tid);
            const d = delta(ca?.scores?.overall, cb?.scores?.overall);
            const color = d == null ? "" : d > 0.05 ? "bg-green-50" : d < -0.05 ? "bg-red-50" : "";
            return (
              <tr key={tid} className={`border-b ${color}`}>
                <td className="py-1 pr-3 font-mono">{tid}</td>
                <td className="py-1 pr-3 font-mono text-blue-700">{pct(ca?.scores?.overall)}</td>
                <td className="py-1 pr-3 font-mono text-green-700">{pct(cb?.scores?.overall)}</td>
                <DeltaCell d={d} />
                <td className="py-1 pr-3 font-mono text-blue-600">{pct(ca?.scores?.medications.f1)}</td>
                <td className="py-1 pr-3 font-mono text-green-600">{pct(cb?.scores?.medications.f1)}</td>
                <td className="py-1 pr-3 font-mono text-blue-600">{pct(ca?.scores?.plan.f1)}</td>
                <td className="py-1 pr-3 font-mono text-green-600">{pct(cb?.scores?.plan.f1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompareContent() {
  const params = useSearchParams();
  const aId = params.get("a");
  const bId = params.get("b");
  const [data, setData] = useState<{ runA: RunDetail; runB: RunDetail } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!aId || !bId) return;
    setLoading(true);
    api.compare(aId, bId).then(setData).finally(() => setLoading(false));
  }, [aId, bId]);

  if (!aId || !bId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Compare Runs</h1>
        <p className="text-gray-500">Select two runs from the <Link href="/runs" className="text-blue-600 underline">runs list</Link> to compare.</p>
      </div>
    );
  }

  if (loading) return <div className="p-6">Loading comparison…</div>;
  if (!data) return <div className="p-6 text-red-500">Failed to load comparison</div>;

  const { runA, runB } = data;
  const rows = getRows(runA.aggregate_scores, runB.aggregate_scores);

  const aWins = rows.filter((r) => winner(r.a, r.b) === "A").length;
  const bWins = rows.filter((r) => winner(r.a, r.b) === "B").length;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/runs" className="text-blue-600 hover:underline text-sm">← Runs</Link>
        <h1 className="text-xl font-bold">Strategy Comparison</h1>
      </div>

      {/* Header cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {[
          { run: runA, label: "A", color: "border-blue-400 bg-blue-50" },
          { run: runB, label: "B", color: "border-green-400 bg-green-50" },
        ].map(({ run, label, color }) => (
          <div key={label} className={`border-2 rounded-lg p-4 ${color}`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-lg">{label}: {run.strategy}</span>
              <Link href={`/runs/${run.id}`} className="text-xs text-blue-600 hover:underline">view run →</Link>
            </div>
            <div className="text-sm text-gray-600 mt-1 font-mono">{run.prompt_hash}</div>
            <div className="mt-2 flex gap-4 text-sm">
              <span>Overall F1: <strong>{pct(run.aggregate_scores?.overall)}</strong></span>
              <span>Cost: <strong>${run.tokens.cost_usd.toFixed(4)}</strong></span>
              <span>Cache: <strong>{run.tokens.cache_read.toLocaleString()}</strong> reads</span>
            </div>
          </div>
        ))}
      </div>

      {/* Win summary */}
      <div className="bg-gray-50 rounded p-3 mb-4 text-sm flex gap-6">
        <span>📊 Field wins: <span className="text-blue-700 font-bold">A: {aWins}</span> vs <span className="text-green-700 font-bold">B: {bWins}</span></span>
        <span>Overall winner: <strong>{aWins > bWins ? `A (${runA.strategy})` : bWins > aWins ? `B (${runB.strategy})` : "Tie"}</strong></span>
      </div>

      {/* Field-level delta table — the key screen */}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b text-left text-gray-500 text-xs">
            <th className="py-2 pr-4 w-48">Field</th>
            <th className="py-2 pr-4 text-blue-700">A ({runA.strategy})</th>
            <th className="py-2 pr-4 text-green-700">B ({runB.strategy})</th>
            <th className="py-2 pr-4">Δ (B−A)</th>
            <th className="py-2 pr-4">Winner</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const d = delta(row.a, row.b);
            const w = winner(row.a, row.b);
            const isMain = !row.label?.includes("↳") && row.key !== "overall";
            return (
              <tr key={row.key} className={`border-b ${row.key === "overall" ? "bg-yellow-50 font-bold" : isMain ? "bg-gray-50" : ""}`}>
                <td className="py-2 pr-4 text-gray-700 font-mono text-xs">{row.label}</td>
                <td className="py-2 pr-4 font-mono text-blue-700">{pct(row.a)}</td>
                <td className="py-2 pr-4 font-mono text-green-700">{pct(row.b)}</td>
                <DeltaCell d={d} />
                <td className="py-2 pr-4"><WinnerBadge winner={w} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Per-case breakdown */}
      <div className="mt-8">
        <h2 className="font-bold text-base mb-2">Per-case breakdown</h2>
        <p className="text-xs text-gray-500 mb-2">Green rows = B significantly better (+5pp). Red = A significantly better.</p>
        <CaseCompareTable
          casesA={(runA.cases ?? []) as CaseResult[]}
          casesB={(runB.cases ?? []) as CaseResult[]}
        />
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <CompareContent />
    </Suspense>
  );
}
