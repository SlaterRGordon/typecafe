import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import formidable from 'formidable';
import { promises as fs } from 'fs';
import { getSession } from 'next-auth/react';

const prisma = new PrismaClient();

export const config = {
    api: {
        bodyParser: false,
    },
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    const session = await getSession({ req });

    if (!session) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
        where: { username: session.user.username },
    });

    if (!user || !user.isAdmin) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const form = formidable({ multiples: true });

    form.parse(req, async (err: Error | null, fields: formidable.Fields, files: formidable.Files) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Failed to parse form data' });
        }

        const title = Array.isArray(fields.title) ? fields.title[0] : fields.title;
        const description = Array.isArray(fields.description) ? fields.description[0] : fields.description;
        const content = Array.isArray(fields.content) ? fields.content[0] : fields.content;

        let imageId: string | undefined;

        if (files.image) {
            const imageFile = Array.isArray(files.image) ? files.image[0] : files.image;
            if (imageFile) {
                const imageBuffer = await fs.readFile(imageFile.filepath);

                // Create the image in the database
                const image = await prisma.image.create({
                    data: {
                        blob: imageBuffer,
                    },
                });

                imageId = image.id;
            }
        }

        try {
            const blogPost = await prisma.blogPost.create({
                data: {
                    title: title as string,
                    description: description as string,
                    content: content as string,
                    authorId: "clwo60ote0000mp0c9h0xksqe",
                    imageId: imageId || undefined,
                },
            });

            res.status(201).json(blogPost);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to create blog post' });
        }
    });
};

export default handler;