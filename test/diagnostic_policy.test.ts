import assert from "node:assert/strict";
import test from "node:test";
import { decideCapture, diagnosticRequestSchema } from "../src/diagnostic_policy.js";

test("groups changing build messages under one developer-facing diagnostic", () => {
  const base = {
    project: "agent-console",
    operation: { kind: "build" as const, buildId: "build-1042", commitSha: "d34db33" },
    stage: "bundle",
    exception: { name: "ModuleResolutionError", message: "missing package at worker 2", stack: "stack-a" },
  };
  const repeated = {
    ...base,
    operation: { ...base.operation, buildId: "build-1043" },
    exception: { ...base.exception, message: "missing package at worker 8", stack: "stack-b" },
  };

  const first = decideCapture(diagnosticRequestSchema.parse(base));
  const second = decideCapture(diagnosticRequestSchema.parse(repeated));

  assert.deepEqual(first.fingerprint, second.fingerprint);
  assert.deepEqual(first.fingerprint, ["agent-console", "build", "bundle", "ModuleResolutionError"]);
  assert.equal(second.context.build_id, "build-1043");
});

test("keeps release and build failures in separate groups", () => {
  const release = diagnosticRequestSchema.parse({
    project: "agent-console",
    operation: { kind: "release", releaseId: "release-88", version: "2.4.0" },
    stage: "bundle",
    exception: { name: "ModuleResolutionError", message: "package missing", stack: "stack" },
  });

  assert.equal(decideCapture(release).fingerprint[1], "release");
});
