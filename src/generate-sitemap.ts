import fs from "fs";
import path from "path";
import { globby } from "globby";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MAX_URLS_PER_SITEMAP = 50000; // Maximum number of URLs per sitemap file

async function getBlogPosts() {
  return await prisma.blogPost.findMany({
    select: {
      id: true,
    },
  });
}

async function getUsers() {
  return await prisma.user.findMany({
    select: {
      username: true,
    },
  });
}

(async () => {
  const pages = await globby([
    'src/pages/**/*{.js,.jsx,.ts,.tsx}',
    '!src/pages/_*.{js,jsx,ts,tsx}',
    '!src/pages/api',
  ]);

  const blogPosts = await getBlogPosts();
  const users = await getUsers();

  const staticPages = pages.map((page) => {
    const routePath = page
      .replace('src/pages', '')
      .replace(/(.tsx|.ts|.jsx|.js)/, '')
      .replace(/\/index$/, '');
    const route = routePath === '/index' ? '' : routePath;

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
    return `
      <url>
        <loc>${`https://www.type.cafe/profile/${user.username}`}</loc>
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
    fs.writeFileSync(sitemapPath, sitemapContent.trim());
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
  fs.writeFileSync(sitemapIndexPath, sitemapIndexContent.trim());
})();