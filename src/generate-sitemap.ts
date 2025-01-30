import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MAX_URLS_PER_SITEMAP = 50000;

async function generateSitemap() {
  const staticRoutes = ['/', '/about', '/contact'];
  const blogPosts = await prisma.blogPost.findMany();
  const users = await prisma.user.findMany();

  const staticPages = staticRoutes.map((route) => {
    return `
      <url>
        <loc>${`https://www.type.cafe${route}`}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
      </url>
    `;
  });

  const dynamicBlogPages = blogPosts.map((post) => {
    return `
      <url>
        <loc>${`https://www.type.cafe/blog/${post.id}`}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
      </url>
    `;
  });

  const dynamicUserPages = users.map((user) => {
    const username = user.username ?? 'unknown';
    return `
      <url>
        <loc>${`https://www.type.cafe/profile/${username}`}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
      </url>
    `;
  });

  const allPages = [...staticPages, ...dynamicBlogPages, ...dynamicUserPages];
  const numSitemaps = Math.ceil(allPages.length / MAX_URLS_PER_SITEMAP);

  const sitemapIndex = [];
  for (let i = 0; i < numSitemaps; i++) {
    const sitemapContent = `
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${allPages.slice(i * MAX_URLS_PER_SITEMAP, (i + 1) * MAX_URLS_PER_SITEMAP).join('')}
      </urlset>
    `;
    const sitemapPath = path.join(process.cwd(), 'public', `sitemap-${i + 1}.xml`);
    await fs.promises.writeFile(sitemapPath, sitemapContent.trim());
    sitemapIndex.push(`
      <sitemap>
        <loc>${`https://www.type.cafe/sitemap-${i + 1}.xml`}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
      </sitemap>
    `);
  }

  const sitemapIndexContent = `
    <?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${sitemapIndex.join('')}
    </sitemapindex>
  `;
  const sitemapIndexPath = path.join(process.cwd(), 'public', 'sitemap-index.xml');
  await fs.promises.writeFile(sitemapIndexPath, sitemapIndexContent.trim());
}

generateSitemap().catch((error) => {
  console.error('Error generating sitemap:', error);
  process.exit(1);
});