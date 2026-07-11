import type { NextApiRequest, NextApiResponse } from "next"
import nodemailer from "nodemailer"
import { contactMessageSchema } from "~/lib/contact"
import { env } from "~/env.mjs"
import { prisma } from "~/server/db"
import { consumePublicWriteQuota } from "~/server/rateLimit"
import { requestIdentity } from "~/server/requestIdentity"

const CONTACT_LIMIT = 3
const CONTACT_WINDOW_MS = 60 * 60 * 1000

export const config = {
    api: { bodyParser: { sizeLimit: "16kb" } },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        res.setHeader("Allow", "POST")
        return res.status(405).json({ message: "Method not allowed" })
    }

    const parsed = contactMessageSchema.safeParse(req.body)
    if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid contact message." })
    }

    const quota = await consumePublicWriteQuota(prisma, {
        scope: "contact",
        identity: requestIdentity(req),
        limit: CONTACT_LIMIT,
        windowMs: CONTACT_WINDOW_MS,
    })
    if (!quota.allowed) {
        res.setHeader("Retry-After", String(quota.retryAfterSeconds))
        return res.status(429).json({ message: "Too many messages. Please try again later." })
    }

    const { name, email, message } = parsed.data
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: env.EMAIL_USER, pass: env.EMAIL_PASS },
    })

    try {
        await transporter.sendMail({
            from: `TypeCafe contact <${env.EMAIL_USER}>`,
            replyTo: email,
            to: env.EMAIL_USER,
            subject: `TypeCafe contact from ${name}`,
            text: `From: ${name} <${email}>\n\n${message}`,
        })
        return res.status(200).json({ message: "Email sent successfully" })
    } catch (error) {
        console.error("Contact email failed", error)
        return res.status(502).json({ message: "Could not send message." })
    }
}
