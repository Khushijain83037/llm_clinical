"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { RunSummary } from "@test-evals/shared";

function pct(n: number | null | undefined) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function statusBadge(s: string) {
  const colors: Record<string, string> = {
    completed: "bg-green-100 text-green-800",
    running: "bg-blue-100 text-blue-800",
    pending: "bg-yellow-100 text-yellow-800",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[s] ?? "bg-gray-100"}`}>
      {s}
    </span>
  );
}

export default function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [strategy, setStrategy] = useState<"zero_shot" | "few_shot" | "cot">("zero_shot");
  const [selected, setSelected] = useState<string[]>([]);

  const load = () => api.runs.list().then(setRuns).finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const startRun = async () => {
    setStarting(true);
    await api.runs.start({ strategy });
    await load();
    setStarting(false);
  };

  const toggleSelect = (id: string) => {
    setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s.slice(-1), id]);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Eval Runs</h1>
        <div className="flex gap-2 items-center">
          <select
            className="border rounded px-2 py-1 text-sm"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as typeof strategy)}
          >
            <option value="zero_shot">zero_shot</option>
            <option value="few_shot">few_shot</option>
            <option value="cot">cot</option>
          </select>
          <button
            onClick={startRun}
            disabled={starting}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
          >
            {starting ? "Starting…" : "Start Run"}
          </button>
          {selected.length === 2 && (
            <Link
              href={`/compare?a=${selected[0]}&b=${selected[1]}`}
              className="bg-purple-600 text-white px-3 py-1 rounded text-sm"
            >
              Compare selected
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4 w-8"></th>
              <th className="py-2 pr-4">Strategy</th>
              <th className="py-2 pr-4">Model</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Progress</th>
              <th className="py-2 pr-4">Overall F1</th>
              <th className="py-2 pr-4">Cost</th>
              <th className="py-2 pr-4">Duration</th>
              <th className="py-2 pr-4">Prompt Hash</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4">
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                </td>
                <td className="py-2 pr-4">
                  <Link href={`/runs/${r.id}`} className="text-blue-600 hover:underline font-mono">
                    {r.strategy}
                  </Link>
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-gray-500">{r.model.split("-").slice(-2).join("-")}</td>
                <td className="py-2 pr-4">{statusBadge(r.status)}</td>
                <td className="py-2 pr-4">{r.completed_cases}/{r.total_cases}</td>
                <td className="py-2 pr-4 font-mono font-bold">{pct(r.aggregate_scores?.overall)}</td>
                <td className="py-2 pr-4 font-mono">${r.tokens.cost_usd.toFixed(4)}</td>
                <td className="py-2 pr-4 font-mono">{(r.wall_ms / 1000).toFixed(1)}s</td>
                <td className="py-2 pr-4 font-mono text-xs text-gray-400">{r.prompt_hash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
