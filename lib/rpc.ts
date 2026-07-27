// Never throws — network failures, timeouts, and non-2xx responses all
// collapse into the same { error } shape every caller already checks. A
// throwing rpc() means every call site needs its own try/catch or it becomes
// an unhandled rejection (the single most common failure mode in this app).
// `offline` marks a network-layer failure (never reached the server) as
// distinct from a definitive server response like "Session expired" — a
// caller may want to retry the former but treat the latter as final (e.g.
// clearing a dead session should never happen just because of a blip).
export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T & { error?: string; offline?: boolean }> {
  try {
    const res = await fetch(`/api/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ...(data as T), error: data?.error || 'Request failed' };
    return data as T & { error?: string };
  } catch (err) {
    const message = err instanceof DOMException && err.name === 'TimeoutError' ? 'Request timed out' : 'Network error';
    return { error: message, offline: true } as T & { error?: string; offline?: boolean };
  }
}
