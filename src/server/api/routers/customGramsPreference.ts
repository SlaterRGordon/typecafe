import { TRPCError } from "@trpc/server"
import { z } from "zod"
import type { Prisma } from "~/generated/prisma/client"
import {
    CUSTOM_GRAMS_PREFERENCE_VERSION,
    emptyCustomGramsPreference,
    mergeCustomGramsPreferences,
    parseCustomGramsPreference,
} from "~/lib/customGramsPreference"
import { PICKER_LANGUAGES } from "~/lib/languageMeta"
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc"

const supportedLanguages = new Set(PICKER_LANGUAGES.map(({ value }) => value))
const languageSchema = z.string().refine((language) => supportedLanguages.has(language), "Unsupported language")
const MAX_SNAPSHOT_BYTES = 8_192
const MAX_TRANSACTION_ATTEMPTS = 3

function isSerializationConflict(error: unknown): boolean {
    return !!error && typeof error === "object" && "code" in error && error.code === "P2034"
}

export const customGramsPreferenceRouter = createTRPCRouter({
    get: protectedProcedure
        .input(z.object({ language: languageSchema }))
        .query(async ({ ctx, input }) => {
            const row = await ctx.prisma.customGramsPreference.findUnique({
                where: { userId_language: { userId: ctx.session.user.id, language: input.language } },
                select: { snapshot: true },
            })
            return row ? parseCustomGramsPreference(row.snapshot, input.language) : emptyCustomGramsPreference(input.language)
        }),

    merge: protectedProcedure
        .input(z.object({ snapshot: z.unknown() }))
        .mutation(async ({ ctx, input }) => {
            const serialized = JSON.stringify(input.snapshot)
            if (serialized && serialized.length > MAX_SNAPSHOT_BYTES) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Snapshot too large" })
            }
            if (!input.snapshot || typeof input.snapshot !== "object") {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid Custom Grams preference" })
            }
            const candidate = input.snapshot as { version?: unknown; language?: unknown; entries?: unknown }
            if ((candidate.version !== 1 && candidate.version !== CUSTOM_GRAMS_PREFERENCE_VERSION)
                || typeof candidate.language !== "string"
                || !supportedLanguages.has(candidate.language)
                || !Array.isArray(candidate.entries)) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid Custom Grams preference" })
            }

            const incoming = parseCustomGramsPreference(input.snapshot, candidate.language)
            const key = { userId: ctx.session.user.id, language: incoming.language }
            for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
                try {
                    return await ctx.prisma.$transaction(async (transaction) => {
                        const existing = await transaction.customGramsPreference.findUnique({
                            where: { userId_language: key },
                            select: { snapshot: true },
                        })
                        const merged = mergeCustomGramsPreferences(incoming.language, existing?.snapshot, incoming)
                        const snapshot = merged as unknown as Prisma.InputJsonValue
                        await transaction.customGramsPreference.upsert({
                            where: { userId_language: key },
                            create: { ...key, snapshot },
                            update: { snapshot },
                        })
                        return merged
                    }, { isolationLevel: "Serializable" })
                } catch (error) {
                    if (!isSerializationConflict(error) || attempt === MAX_TRANSACTION_ATTEMPTS - 1) throw error
                }
            }
            throw new TRPCError({ code: "CONFLICT", message: "Could not merge Custom Grams preference" })
        }),
})
