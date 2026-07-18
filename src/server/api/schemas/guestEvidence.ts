import { z } from "zod"
import { EVIDENCE_CONTEXTS } from "~/lib/evidenceContext"
import type { GuestEvidenceTest } from "~/lib/guestEvidence"
import { GUEST_EVIDENCE_IMPORT_BATCH_SIZE } from "~/lib/guestEvidenceLimits"
import { encodedTimelineSchema } from "~/lib/keystrokeTimelineSchema"

const configurationSchema = z.object({
    mode: z.number().int().min(0).max(4),
    subMode: z.number().int().min(0).max(1),
    count: z.number().int().min(1).max(5000),
    options: z.string().max(250),
    punctuation: z.boolean(),
    capitals: z.boolean(),
    numbers: z.boolean(),
    layout: z.string().min(1).max(32),
    language: z.string().min(1).max(64),
    utcOffsetMinutes: z.number().int().min(-14 * 60).max(14 * 60),
}).strict()

export const guestEvidenceTestSchema: z.ZodType<GuestEvidenceTest> = z.object({
    localId: z.string().min(1).max(128),
    completedAt: z.number().int().nonnegative(),
    context: z.enum(EVIDENCE_CONTEXTS),
    config: configurationSchema,
    timeline: encodedTimelineSchema,
}).strict()

export const guestEvidenceImportSchema = z.object({
    tests: z.array(guestEvidenceTestSchema).max(GUEST_EVIDENCE_IMPORT_BATCH_SIZE),
})
