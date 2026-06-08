import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/server/auth";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

function slugFileName(fileName: string) {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const session = await getServerSession(req, res, authOptions);
        const userId = session?.user?.id;

        if (!userId) {
          throw new Error("You must be signed in to upload a profile picture.");
        }

        const safePrefix = `avatars/${userId}/`;
        if (!pathname.startsWith(safePrefix)) {
          throw new Error("Invalid profile picture path.");
        }

        const safePathname = `${safePrefix}${slugFileName(pathname.slice(safePrefix.length))}`;
        if (safePathname !== pathname) {
          throw new Error("Invalid profile picture filename.");
        }

        return {
          allowedContentTypes: ALLOWED_AVATAR_TYPES,
          maximumSizeInBytes: MAX_AVATAR_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId }),
        };
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Could not upload profile picture.",
    });
  }
}
