// Respects the Vite `base` so a subpath deploy (/partpilot/) hits /partpilot/api.
// Dev: BASE_URL="/" -> "/api". Subpath: BASE_URL="/partpilot/" -> "/partpilot/api".
export const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const BASE = API_BASE;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText) as Error & { status?: number; data?: unknown };
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T,>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  del: <T,>(path: string) => request<T>("DELETE", path),
};

// Resolve a stored file reference to a loadable URL. Absolute URLs (old
// https:// spec-sheet links, data:/blob:) pass through unchanged; a relative
// "uploads/…" path returned by POST /uploads is prefixed with the API base.
export function fileUrl(v?: string | null): string {
  if (!v) return "";
  if (/^(https?:|data:|blob:)/i.test(v)) return v;
  return `${API_BASE}/${String(v).replace(/^\//, "")}`;
}

// Read a File as a base64 data URL for the JSON upload endpoint.
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Upload a file and return its stored reference + display name.
export async function uploadFile(file: File): Promise<{ url: string; name: string }> {
  const dataUrl = await fileToDataUrl(file);
  return api.post<{ url: string; name: string }>("/uploads", { filename: file.name, dataUrl });
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  }
  const s = p.toString();
  return s ? "?" + s : "";
}
