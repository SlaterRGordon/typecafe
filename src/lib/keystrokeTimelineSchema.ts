import { z } from "zod"
import type { EncodedTimeline } from "./keystrokes"

const MAX_EVENTS = 50_000
const MAX_DELTA_MS = 24 * 60 * 60 * 1000
const stateSchema = z.union([z.literal(0), z.literal(1), z.literal(2)])
const deltaSchema = z.number().int().min(0).max(MAX_DELTA_MS)
const unicodeScalarSchema = z.number().int().min(1).max(0x10ffff)
    .refine((value) => value < 0xd800 || value > 0xdfff, "Invalid Unicode code point")

const v1EventSchema = z.tuple([
    z.number().int().min(0).max(0xffff),
    stateSchema,
    deltaSchema,
])

const v2EventSchema = z.tuple([
    z.number().int().min(0).max(0x10ffff),
    z.number().int().min(0).max(0x10ffff),
    stateSchema,
    deltaSchema,
]).superRefine(([expected, typed, state], context) => {
    const expectedIsScalar = unicodeScalarSchema.safeParse(expected).success
    const typedIsScalar = unicodeScalarSchema.safeParse(typed).success
    const valid = state === 2
        ? expected === 0 && typed === 0
        : expectedIsScalar && (state === 1 ? typed === 0 : typedIsScalar)
    if (!valid) context.addIssue({ code: "custom", message: "Invalid v2 timeline event" })
})

// Readers accept v1 indefinitely; writers emit v2. Strict objects prevent
// unbounded extra properties from bypassing the event cap.
export const encodedTimelineSchema: z.ZodType<EncodedTimeline> = z.union([
    z.array(v1EventSchema).max(MAX_EVENTS),
    z.object({
        v: z.literal(2),
        events: z.array(v2EventSchema).max(MAX_EVENTS),
    }).strict(),
])
