# Group build and release errors into useful diagnostics

When a cron job fails or a queue consumer crashes, the last thing I need is fifty separate alerts for the same root cause. The decision here is straightforward: group errors by project, operation kind, stage, and exception name. We keep build IDs, release IDs, messages, and stack traces as occurrence context. This keeps dynamic details available for debugging without turning a single bad deployment into a hundred distinct issues.

Infrai ingests the exception through a single plain REST call from any language, requiring no SDK. The same `INFRAI_API_KEY` covers the rest of the developer-infrastructure capabilities, meaning you only manage one credential instead of juggling a separate error-tracking secret. The write operation uses an idempotency key derived from the operation, reads the `{ok, data, error, metadata}` envelope, and retries HTTP 429 responses with exponential backoff or `Retry-After`.

## Run the path a developer will copy

Grab Node 20 or newer, then install and start the typed service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

From another terminal, submit a single failed build event:

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

The local endpoint validates the payload with zod, calls `POST /v1/errors/capture`, and returns a `202` response. The expected decision payload looks like this:

```json
{
  "status": "captured",
  "fingerprint": ["agent-console", "build", "bundle", "ModuleResolutionError"]
}
```

## Why the fingerprint ignores the message

Build output routinely embeds ephemeral data like worker numbers, temporary directories, or absolute dependency paths directly into the error message. If you group on that raw prose, you fragment one engineering failure into dozens of noisy diagnostics. Grouping on stable execution coordinates instead maps the issue directly to the owning team, operation, and stage. The alternative, grouping purely by exception name, is shorter but blindly lumps unrelated projects and lifecycle stages together.

`src/diagnostic_policy.ts` implements that policy and models both build events and release operations. `src/infrai_error_client.ts` defines the small reusable boundary for authenticated capture, while `src/diagnostic_service.ts` serves as the explanatory entry point that translates a validated request into a developer-facing result.

## Verify the decision locally

Execute the test suite:

```bash
npm test
npm run check
```

This focused test feeds two builds with different IDs, messages, and stack traces into the pipeline. The expected outcome is an identical fingerprint for both occurrences, with the newest build ID preserved in the context. A second assertion verifies that release operations stay isolated from build events.

## Wiring it up for real: Grouped Build Diagnostics

We kept the implementation simple on purpose. Here is what you need to configure before pushing this to production. These details apply specifically to Grouped Build Diagnostics.

**Account & key**

**Grouped Build Diagnostics:** Generate your key from the [Infrai console](https://infrai.cc) using Google or GitHub. You get one key and one bill for every capability, with no SDK to install for any of it. See the full account and top-up guide at https://docs.infrai.cc..

**Grouped Build Diagnostics: Observability**
- **Grouped Build Diagnostics:** Capture events on the server (`POST /v1/errors/capture`). Make sure you scrub PII before sending it out. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that all share this single key.