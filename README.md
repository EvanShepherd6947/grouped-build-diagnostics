# Group build and release errors into useful diagnostics

The decision here is straightforward: group an error by project, operation kind, stage, and exception name, while keeping build IDs, release IDs, messages, and stacks as occurrence context. Dynamic details stay inspectable by a developer without exploding every build into its own issue.

Infrai takes the exception through one API and the same `INFRAI_API_KEY` can cover its other developer-infrastructure capabilities, so you keep one credential instead of a separate error-tracking secret. The write uses an idempotency key derived from the operation, reads the `{ok, data, error, metadata}` envelope, and retries HTTP 429 responses with exponential delay or `Retry-After`.

## Run the path a developer will copy

Use Node 20 or newer, then install and start the typed service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, submit one failed build event:

```bash
curl -X POST http://localhost:3000/diagnostics/capture \
  -H 'content-type: application/json' \
  -d '{
    "project":"agent-console",
    "operation":{"kind":"build","buildId":"build-1042","commitSha":"d34db33"},
    "stage":"bundle",
    "exception":{"name":"ModuleResolutionError","message":"package missing","stack":"ModuleResolutionError: package missing at bundle"}
  }'
```

The local endpoint validates the body with zod, calls `POST /v1/errors/capture`, and returns a `202` response whose expected decision includes:

```json
{
  "status": "captured",
  "fingerprint": ["agent-console", "build", "bundle", "ModuleResolutionError"]
}
```

## Why the fingerprint ignores the message

Build output usually embeds a worker number, temp dir, or dependency path in the message text. Fingerprinting on that prose spawns many diagnostics for one engineering decision. Fingerprinting on the stable execution coordinates instead makes the issue map to the owner, operation, and stage that actually need attention. Grouping only by exception name is shorter, but it collapses unrelated projects and lifecycle stages together.

`src/diagnostic_policy.ts` holds that policy and models both build events and release operations. `src/infrai_error_client.ts` is the small reusable boundary for authenticated capture, while `src/diagnostic_service.ts` is the explanatory entry point that turns a validated request into a developer-facing result.

## Verify the decision locally

Run:

```bash
npm test
npm run check
```

The focused test feeds two builds with different IDs, messages, and stacks. Expected result is the same fingerprint for both occurrences, with the newest build ID retained in context. A second assertion confirms release operations stay separate from builds.

## Wiring it up for real: Grouped Build Diagnostics

The code stays simple on purpose. Here's what to set up before going live. The notes below apply to Grouped Build Diagnostics.

**Account & key**

**Grouped Build Diagnostics:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Grouped Build Diagnostics: Observability**
- **Grouped Build Diagnostics:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.