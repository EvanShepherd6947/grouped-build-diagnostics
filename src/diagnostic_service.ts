import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { ZodError } from "zod";
import { decideCapture, diagnosticRequestSchema } from "./diagnostic_policy.js";
import { captureError } from "./infrai_error_client.js";

const port = Number(process.env.PORT ?? 3000);

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/diagnostics/capture") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const input = diagnosticRequestSchema.parse(await readJson(request));
    const decision = decideCapture(input);
    const operationId = input.operation.kind === "build"
      ? input.operation.buildId
      : input.operation.releaseId;
    const idempotencyKey = createHash("sha256")
      .update(`${input.project}:${input.operation.kind}:${operationId}:${input.stage}`)
      .digest("hex");

    const captured = await captureError({
      title: decision.title,
      message: input.exception.message,
      level: "error",
      fingerprint: decision.fingerprint,
      exception: input.exception.stack,
      context: decision.context,
    }, idempotencyKey);

    sendJson(response, 202, {
      status: "captured",
      fingerprint: decision.fingerprint,
      event: captured,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      sendJson(response, 400, { error: "Invalid diagnostic", issues: error.issues });
      return;
    }
    const message = error instanceof Error ? error.message : "Unexpected error";
    sendJson(response, 502, { error: message });
  }
}).listen(port, () => {
  console.log(`Diagnostic service listening on http://localhost:${port}`);
});
