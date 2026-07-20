import { z } from "zod"
import { parsePracticeRecord, type PracticeRecord } from "~/lib/evidenceContext"

export { encodedTimelineSchema } from "~/lib/keystrokeTimelineSchema"

export const practiceRecordSchema: z.ZodType<PracticeRecord> = z.custom<PracticeRecord>(
    (value) => parsePracticeRecord(value) !== null,
    "Invalid Practice evidence metadata",
)
