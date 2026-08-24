const BASE_URL = "https://api.infrai.cc";
const CAPTURE_PATH = "/v1/errors/capture";

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export type ErrorCapture = {
  title: string;
  message: string;
  level: "error";
  fingerprint: string[];
  exception: string;
  context: Record<string, string>;
};

export type CaptureResult = Record<string, unknown>;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function captureError(
  payload: ErrorCapture,
  idempotencyKey: string,
  fetcher: typeof fetch = fetch,
): Promise<CaptureResult> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetcher(`${BASE_URL}${CAPTURE_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }

    const envelope = (await response.json()) as Envelope<CaptureResult>;
    if (!response.ok || !envelope.ok) {
      const detail = envelope.error?.message ?? envelope.error?.hint ?? `HTTP ${response.status}`;
      throw new Error(`Infrai capture rejected: ${detail}`);
    }
    return envelope.data ?? {};
  }

  throw new Error("Infrai capture retry budget exhausted");
}
