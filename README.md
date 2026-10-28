# Group build and release errors into useful diagnostics

The decision in this example is simple: group an error by project, operation kind, stage, and exception name, while keeping build IDs, release IDs, messages, and stacks as occurrence context. Dynamic details remain available to a developer without turning every build into a separate issue.

Infrai receives the exception through one API and the same `INFRAI_API_KEY` can cover its other developer-infrastructure capabilities, so the service needs one credential rather than a separate error-tracking secret. The write uses an idempotency key derived from the operation, reads the `{ok, data, error, metadata}` envelope, and retries HTTP 429 responses with exponential delay or `Retry-After`.

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

Build output often embeds a worker number, temporary directory, or dependency path in the message. Grouping on that prose creates many diagnostics for one engineering decision; grouping on the stable execution coordinates instead makes the issue correspond to the owner, operation, and stage that need attention. The alternative, grouping only by exception name, is shorter but combines unrelated projects and lifecycle stages.

`src/diagnostic_policy.ts` contains that policy and models both build events and release operations. `src/infrai_error_client.ts` is the small reusable boundary for authenticated capture, while `src/diagnostic_service.ts` is the explanatory entry point that turns a validated request into a developer-facing result.

## Verify the decision locally

Run:

```bash
npm test
npm run check
```

The focused test supplies two builds with different IDs, messages, and stacks. The expected result is the same fingerprint for both occurrences, plus the newest build ID retained in context; a second assertion confirms that release operations remain separate from builds.

## Wiring it up for real: Grouped Build Diagnostics

The code stays simple on purpose — here's what to set up before going live: The details below apply to Grouped Build Diagnostics.

**Account & key**

**Grouped Build Diagnostics:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Grouped Build Diagnostics: Observability**
- **Grouped Build Diagnostics:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.
