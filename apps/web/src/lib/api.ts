const SERVER = "https://modelapi.devchauhan.com";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SERVER}${path}`, init);
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return res.json();
}

export const api = {
  runs: {
    list: () => apiFetch<any[]>("/api/v1/runs"),
    get: (id: string) => apiFetch<any>(`/api/v1/runs/${id}`),
    start: (body: any) => apiFetch<any>("/api/v1/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    resume: (id: string) => apiFetch<any>(`/api/v1/runs/${id}/resume`, { method: "POST" }),
    case: (runId: string, transcriptId: string) => apiFetch<any>(`/api/v1/runs/${runId}/cases/${transcriptId}`),
  },
  compare: (a: string, b: string) => apiFetch<any>(`/api/v1/compare?a=${a}&b=${b}`),
};
