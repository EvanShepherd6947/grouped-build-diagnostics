import { z } from "zod";

export const diagnosticRequestSchema = z.object({
  project: z.string().min(1),
  operation: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("build"),
      buildId: z.string().min(1),
      commitSha: z.string().min(7),
    }),
    z.object({
      kind: z.literal("release"),
      releaseId: z.string().min(1),
      version: z.string().min(1),
    }),
  ]),
  stage: z.string().min(1),
  exception: z.object({
    name: z.string().min(1),
    message: z.string().min(1),
    stack: z.string().min(1),
  }),
});

export type DiagnosticRequest = z.infer<typeof diagnosticRequestSchema>;

export type CaptureDecision = {
  title: string;
  fingerprint: string[];
  context: Record<string, string>;
};

export function decideCapture(input: DiagnosticRequest): CaptureDecision {
  const operationContext: Record<string, string> = input.operation.kind === "build"
    ? { build_id: input.operation.buildId, commit_sha: input.operation.commitSha }
    : { release_id: input.operation.releaseId, version: input.operation.version };

  return {
    title: `${input.project} ${input.operation.kind} failed during ${input.stage}`,
    fingerprint: [input.project, input.operation.kind, input.stage, input.exception.name],
    context: {
      project: input.project,
      operation_kind: input.operation.kind,
      stage: input.stage,
      ...operationContext,
    },
  };
}
