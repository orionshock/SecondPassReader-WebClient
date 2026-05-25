export type RequestUrlOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  accessToken?: string | null;
  defaultAccessToken?: string | null;
  body?: unknown;
  headers?: Record<string, string>;
  url: string;
};

export type ApiErrorKind = "unauthorized" | "forbidden" | "http_error";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;

  constructor(input: { kind: ApiErrorKind; status: number; message: string }) {
    super(input.message);
    this.kind = input.kind;
    this.status = input.status;
  }
}

export function resolveUrl(baseUrl: string, endpointOrUrl: string): string {
  if (/^https?:\/\//i.test(endpointOrUrl)) return endpointOrUrl;
  const base = baseUrl.replace(/\/+$/, "");
  const path = endpointOrUrl.startsWith("/") ? endpointOrUrl : `/${endpointOrUrl}`;
  return `${base}${path}`;
}

export async function requestJsonUrl<T>(options: RequestUrlOptions): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  const token = options.accessToken ?? options.defaultAccessToken;
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const res = await fetch(options.url, {
    method: options.method ?? "GET",
    headers,
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed: ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`);
  }

  return (await res.json()) as T;
}

export function tryParseFilename(contentDisposition: string): string | undefined {
  // RFC 6266 basics: filename="<name>" or filename*=UTF-8''<urlencoded>
  const filenameStar = /filename\*\s*=\s*([^']*)''([^;]+)/i.exec(contentDisposition);
  if (filenameStar) {
    const encoded = filenameStar[2].trim();
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }

  const filename = /filename\s*=\s*\"?([^\";]+)\"?/i.exec(contentDisposition);
  if (filename) return filename[1].trim();
  return undefined;
}

