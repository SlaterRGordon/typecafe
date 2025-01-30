import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const blogPosts = await prisma.blogPost.findMany({
      include: {
        image: true,
        author: true,
      },
    });

    if (!blogPosts) {
      return res.status(404).json({ error: 'Blog post not found' });
    }

    res.status(200).json(blogPosts);
  } catch (error) {
    console.error('Error fetching blog post:', error);
    res.status(500).json({ error: 'Failed to fetch blog post' });
  }
};

export default handler;