const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:4100").replace(/\/$/, "");

export async function api<T>(path: string, options: RequestInit = {}, timeoutMs = 25_000): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout.signal])
    : timeout.signal;

  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `The request failed (${response.status}).`);
    }
    return data as T;
  } catch (error) {
    if (timeout.signal.aborted) throw new Error("The village connection timed out. Please try again.");
    if (error instanceof TypeError) throw new Error("The village API is offline. Check the connection and try again.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function downloadUrl(value: string): string | null {
  if (!/^\/v1\/jobs\/[a-zA-Z0-9-]+\/files\/model$/.test(value)) return null;
  return `${API_URL}${value}`;
}
