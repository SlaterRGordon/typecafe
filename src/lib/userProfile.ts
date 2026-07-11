import { z } from "zod"

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 24
export const BIO_MAX_LENGTH = 160
export const PROFILE_LINK_MAX_LENGTH = 500

export const usernameSchema = z.string()
    .trim()
    .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters.`)
    .max(USERNAME_MAX_LENGTH, `Username must be at most ${USERNAME_MAX_LENGTH} characters.`)
    .regex(/^[a-zA-Z0-9_]+$/, "Use only letters, numbers, and underscores.")

export const emailSchema = z.string()
    .trim()
    .toLowerCase()
    .max(254)
    .email("Enter a valid email address.")

export const passwordSchema = z.string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must be at most 72 characters.")
    .regex(/[a-z]/, "Password needs a lowercase letter.")
    .regex(/[A-Z]/, "Password needs an uppercase letter.")
    .regex(/[0-9]/, "Password needs a number.")

export const bioSchema = z.string().trim().max(BIO_MAX_LENGTH)

export const profileLinkSchema = z.string()
    .trim()
    .max(PROFILE_LINK_MAX_LENGTH)
    .refine((value) => {
        if (value === "") return true
        try {
            const protocol = new URL(value).protocol
            return protocol === "https:" || protocol === "http:"
        } catch {
            return false
        }
    }, "Enter a full http:// or https:// URL.")

export const registrationSchema = z.object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
})

export const profileUpdateSchema = z.object({
    username: usernameSchema.optional(),
    bio: bioSchema.optional(),
    link: profileLinkSchema.optional(),
})
