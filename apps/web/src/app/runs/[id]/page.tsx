"use client";
import { useEffect, useState, use } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { RunDetail, CaseResult, FieldScores } from "@test-evals/shared";

const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:8787";

function pct(n: number | null | undefined, decimals = 1) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(decimals)}%`;
}

function scoreColor(n: number | null | undefined) {
  if (n == null) return "text-gray-400";
  if (n >= 0.8) return "text-green-700";
  if (n >= 0.5) return "text-yellow-600";
  return "text-red-600";
}

function CacheBar({ cacheRead, total }: { cacheRead: number; total: number }) {
  if (!total) return null;
  const pct = total > 0 ? (cacheRead / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span>Cache hit rate: {pct.toFixed(0)}%</span>
      <div className="w-32 bg-gray-200 rounded h-1.5">
        <div className="bg-green-500 h-1.5 rounded" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<RunDetail | null>(null);
  const [liveProgress, setLiveProgress] = useState<{ completed: number; total: number } | null>(null);
  const [selectedCase, setSelectedCase] = useState<string | null>(null);

  useEffect(() => {
    api.runs.get(id).then(setRun);

    const es = new EventSource(`${SERVER}/api/v1/runs/${id}/stream`);
    es.onmessage = (e) => {
      const ev = JSON.parse(e.data);
      if (ev.type === "progress") {
        setLiveProgress({ completed: ev.completed, total: ev.total });
        if (ev.case_result) {
          setRun((prev) => {
            if (!prev) return prev;
            const cases = [...(prev.cases ?? []).filter((c: CaseResult) => c.transcript_id !== ev.case_result.transcript_id), ev.case_result];
            return { ...prev, cases, completed_cases: ev.completed };
          });
        }
      }
      if (ev.type === "complete") {
        api.runs.get(id).then(setRun);
        es.close();
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [id]);

  if (!run) return <div className="p-6">Loading…</div>;

  const cases: CaseResult[] = (run.cases ?? []).sort((a: CaseResult, b: CaseResult) =>
    a.transcript_id.localeCompare(b.transcript_id)
  );

  const totalTokens = (run.tokens.input + run.tokens.cache_read + run.tokens.cache_write);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/runs" className="text-blue-600 hover:underline text-sm">← Runs</Link>
        <h1 className="text-xl font-bold">{run.strategy}</h1>
        <span className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{run.prompt_hash}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${run.status === "completed" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
          {run.status}
        </span>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-6 gap-3 mb-6 text-sm">
        {[
          ["Overall F1", pct(run.aggregate_scores?.overall)],
          ["Medications F1", pct(run.aggregate_scores?.medications.f1)],
          ["Diagnoses F1", pct(run.aggregate_scores?.diagnoses.f1)],
          ["Plan F1", pct(run.aggregate_scores?.plan.f1)],
          ["Cost", `$${run.tokens.cost_usd.toFixed(4)}`],
          ["Cache reads", run.tokens.cache_read.toLocaleString()],
        ].map(([label, val]) => (
          <div key={label} className="bg-gray-50 rounded p-3 text-center">
            <div className="text-gray-500 text-xs">{label}</div>
            <div className="font-bold text-lg mt-0.5">{val}</div>
          </div>
        ))}
      </div>

      <CacheBar cacheRead={run.tokens.cache_read} total={totalTokens} />

      {liveProgress && run.status === "running" && (
        <div className="mt-3 text-sm text-blue-600">
          ⏳ {liveProgress.completed} / {liveProgress.total} cases completed…
        </div>
      )}

      {/* Cases table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-3">Case</th>
              <th className="py-2 pr-3">Overall</th>
              <th className="py-2 pr-3">Complaint</th>
              <th className="py-2 pr-3">Vitals</th>
              <th className="py-2 pr-3">Meds F1</th>
              <th className="py-2 pr-3">Dx F1</th>
              <th className="py-2 pr-3">Plan F1</th>
              <th className="py-2 pr-3">Attempts</th>
              <th className="py-2 pr-3">Valid</th>
              <th className="py-2 pr-3">Halluc.</th>
              <th className="py-2 pr-3">Cost</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c: CaseResult) => {
              const s = c.scores;
              const ungrounded = c.hallucinations?.filter((h) => !h.grounded).length ?? 0;
              return (
                <tr
                  key={c.transcript_id}
                  className={`border-b cursor-pointer ${selectedCase === c.transcript_id ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  onClick={() => setSelectedCase(selectedCase === c.transcript_id ? null : c.transcript_id)}
                >
                  <td className="py-1.5 pr-3 font-mono">{c.transcript_id}</td>
                  <td className={`py-1.5 pr-3 font-mono font-bold ${scoreColor(s?.overall)}`}>{pct(s?.overall)}</td>
                  <td className={`py-1.5 pr-3 font-mono ${scoreColor(s?.chief_complaint)}`}>{pct(s?.chief_complaint)}</td>
                  <td className={`py-1.5 pr-3 font-mono ${scoreColor(s?.vitals.avg)}`}>{pct(s?.vitals.avg)}</td>
                  <td className={`py-1.5 pr-3 font-mono ${scoreColor(s?.medications.f1)}`}>{pct(s?.medications.f1)}</td>
                  <td className={`py-1.5 pr-3 font-mono ${scoreColor(s?.diagnoses.f1)}`}>{pct(s?.diagnoses.f1)}</td>
                  <td className={`py-1.5 pr-3 font-mono ${scoreColor(s?.plan.f1)}`}>{pct(s?.plan.f1)}</td>
                  <td className="py-1.5 pr-3 font-mono">{c.attempt_count}</td>
                  <td className="py-1.5 pr-3">{c.schema_valid ? "✓" : "✗"}</td>
                  <td className={`py-1.5 pr-3 font-mono ${ungrounded > 0 ? "text-red-600 font-bold" : "text-gray-400"}`}>{ungrounded}</td>
                  <td className="py-1.5 pr-3 font-mono text-gray-500">${c.tokens.cost_usd.toFixed(5)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Case detail panel */}
      {selectedCase && (
        <CaseDetailPanel runId={id} transcriptId={selectedCase} />
      )}
    </div>
  );
}

function CaseDetailPanel({ runId, transcriptId }: { runId: string; transcriptId: string }) {
  const [data, setData] = useState<unknown>(null);

  useEffect(() => {
    api.runs.case(runId, transcriptId).then(setData);
  }, [runId, transcriptId]);

  if (!data) return <div className="mt-4 p-4 border rounded text-sm">Loading case…</div>;

  const d = data as {
    transcript: string;
    gold: unknown;
    prediction: unknown;
    attempts: Array<{ attempt: number; validation_errors: string[]; success: boolean }>;
    tokens: { cache_read: number };
  };

  return (
    <div className="mt-4 border rounded p-4 text-xs">
      <h3 className="font-bold text-sm mb-3">{transcriptId}</h3>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="font-semibold text-gray-500 mb-1">Transcript</div>
          <pre className="whitespace-pre-wrap bg-gray-50 p-2 rounded text-xs overflow-auto max-h-64">{d.transcript}</pre>
        </div>
        <div>
          <div className="font-semibold text-gray-500 mb-1">Gold</div>
          <pre className="bg-green-50 p-2 rounded text-xs overflow-auto max-h-64">{JSON.stringify(d.gold, null, 2)}</pre>
        </div>
        <div>
          <div className="font-semibold text-gray-500 mb-1">Prediction</div>
          <pre className="bg-blue-50 p-2 rounded text-xs overflow-auto max-h-64">{JSON.stringify(d.prediction, null, 2)}</pre>
        </div>
      </div>
      {d.attempts?.length > 1 && (
        <div className="mt-3">
          <div className="font-semibold text-gray-500 mb-1">Retry trace ({d.attempts.length} attempts)</div>
          {d.attempts.map((a) => (
            <div key={a.attempt} className={`p-2 mb-1 rounded ${a.success ? "bg-green-50" : "bg-red-50"}`}>
              <span className="font-mono">Attempt {a.attempt}: {a.success ? "✓ success" : `✗ ${a.validation_errors.join("; ")}`}</span>
            </div>
          ))}
        </div>
      )}
      {d.tokens.cache_read > 0 && (
        <div className="mt-2 text-green-600 text-xs">💾 Cache read: {d.tokens.cache_read} tokens</div>
      )}
    </div>
  );
}
