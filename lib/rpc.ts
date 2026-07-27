export async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data as T;
}
