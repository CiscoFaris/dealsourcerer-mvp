export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const key = process.env.NEXT_PUBLIC_APP_KEY || "";
  const headers = new Headers(init.headers || {});
  if (key) headers.set("x-app-key", key);

  return fetch(input, { ...init, headers });
}
