import { z } from "zod"

export const contactMessageSchema = z.object({
    name: z.string().trim().min(1).max(80).refine((value) => !/[\r\n]/.test(value), "Name contains invalid characters."),
    email: z.string().trim().toLowerCase().max(254).email(),
    message: z.string().trim().min(10).max(5000),
    // Honeypot: real users never see or fill this field.
    website: z.string().max(0).optional(),
})
