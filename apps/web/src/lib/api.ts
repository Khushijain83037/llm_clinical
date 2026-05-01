const SERVER = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:8787";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export const api = {
  runs: {
    list: () => apiFetch<import("@test-evals/shared").RunSummary[]>("/api/v1/runs"),
    get: (id: string) => apiFetch<import("@test-evals/shared").RunDetail>(`/api/v1/runs/${id}`),
    start: (body: import("@test-evals/shared").StartRunRequest) =>
      apiFetch<import("@test-evals/shared").StartRunResponse>("/api/v1/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    resume: (id: string) =>
      apiFetch<{ ok: boolean }>(`/api/v1/runs/${id}/resume`, { method: "POST" }),
    case: (runId: string, transcriptId: string) =>
      apiFetch<unknown>(`/api/v1/runs/${runId}/cases/${transcriptId}`),
  },
  compare: (a: string, b: string) =>
    apiFetch<{ runA: import("@test-evals/shared").RunDetail; runB: import("@test-evals/shared").RunDetail }>(
      `/api/v1/compare?a=${a}&b=${b}`
    ),
};
