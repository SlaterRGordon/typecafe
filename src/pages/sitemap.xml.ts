import { PrismaClient } from "@prisma/client";
import { globby } from "globby";
import { GetServerSidePropsContext } from "next";

const prisma = new PrismaClient();
const EXTERNAL_DATA_URL = "https://www.type.cafe";

interface BlogPost {
    id: string;
}

interface User {
    username: string;
}

function generateSiteMap(staticPages: string[], blogPosts: BlogPost[], users: User[]) {
    return `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${staticPages
            .map((page) => {
                const routePath = page
                    .replace('src/pages', '')
                    .replace(/(.tsx|.ts|.jsx|.js)/, '')
                    .replace(/\/index$/, '');
                const route = routePath === '/index' ? '' : routePath;

                return `
          <url>
            <loc>${`${EXTERNAL_DATA_URL}${route}`}</loc>
            <lastmod>${new Date().toISOString()}</lastmod>
          </url>
        `;
            })
            .join('')}
    ${blogPosts
            .map(({ id }) => {
                return `
          <url>
            <loc>${`${EXTERNAL_DATA_URL}/blog/${id}`}</loc>
            <lastmod>${new Date().toISOString()}</lastmod>
          </url>
        `;
            })
            .join('')}
    ${users
            .map(({ username }) => {
                return `
          <url>
            <loc>${`${EXTERNAL_DATA_URL}/profile/${username}`}</loc>
            <lastmod>${new Date().toISOString()}</lastmod>
          </url>
        `;
            })
            .join('')}
  </urlset>
  `;
}

function SiteMap() {
    // getServerSideProps will do the heavy lifting
}

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
    // Fetch static pages
    const staticPages = await globby([
        'src/pages/**/*{.js,.jsx,.ts,.tsx}',
        '!src/pages/_*.{js,jsx,ts,tsx}',
        '!src/pages/api',
        '!src/pages/**/[*.{js,jsx,ts,tsx}', // Ignore dynamic routes
    ]);

    // Fetch dynamic routes data
    const blogPosts = await prisma.blogPost.findMany({
        select: {
            id: true,
        },
    });

    const users = await prisma.user.findMany({
        select: {
            username: true,
        },
    });

    // Ensure usernames are strings and not null
    const sanitizedUsers: User[] = users.map((user) => ({
        username: user.username ?? 'unknown',
    }));

    // Generate the XML sitemap with the fetched data
    const sitemap = generateSiteMap(staticPages, blogPosts, sanitizedUsers);

    res.setHeader('Content-Type', 'text/xml');
    // Send the XML to the browser
    res.write(sitemap);
    res.end();

    return {
        props: {},
    };
}

export default SiteMap;