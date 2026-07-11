import { globby } from "globby";
import type { GetServerSidePropsContext } from "next";
import { prisma } from "~/server/db";

const EXTERNAL_DATA_URL = "https://typecafe.app";

interface User {
    username: string;
}

function priorityFor(route: string): { priority: string; changefreq: string } {
    if (route === "") return { priority: "1.0", changefreq: "daily" };
    if (route.startsWith("/profile/")) return { priority: "0.6", changefreq: "weekly" };
    return { priority: "0.3", changefreq: "monthly" };
}

function urlEntry(loc: string, lastmod: string, priority: string, changefreq: string) {
    return `
    <url>
      <loc>${loc}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>${changefreq}</changefreq>
      <priority>${priority}</priority>
    </url>`;
}

function generateSiteMap(staticPages: string[], users: User[]) {
    const now = new Date().toISOString();

    const staticEntries = staticPages.map((page) => {
        const routePath = page
            .replace('src/pages', '')
            .replace(/(.tsx|.ts|.jsx|.js)/, '')
            .replace(/\/index$/, '');
        const route = routePath === '/index' ? '' : routePath;
        const { priority, changefreq } = priorityFor(route);
        return urlEntry(`${EXTERNAL_DATA_URL}${route}`, now, priority, changefreq);
    });

    const profileEntries = users.map(({ username }) =>
        urlEntry(`${EXTERNAL_DATA_URL}/profile/${encodeURIComponent(username)}`, now, "0.6", "weekly")
    );

    // Per-score share pages are noindex,follow (growth-seo §C) — social cards,
    // not search landing pages — so they're deliberately absent here.
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${[...staticEntries, ...profileEntries].join('')}
</urlset>`;
}

function SiteMap() {
    // getServerSideProps will do the heavy lifting
}

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
    const staticPages = await globby([
        'src/pages/**/*{.js,.jsx,.ts,.tsx}',
        '!src/pages/_*.{js,jsx,ts,tsx}',
        '!src/pages/api',
        '!src/pages/**/[*.{js,jsx,ts,tsx}',
    ]);

    const users = await prisma.user.findMany({ select: { username: true } });

    const sanitizedUsers: User[] = users.map((user) => ({
        username: user.username ?? 'unknown',
    }));

    const sitemap = generateSiteMap(staticPages, sanitizedUsers);

    res.setHeader('Content-Type', 'text/xml');
    res.write(sitemap);
    res.end();

    return { props: {} };
}

export default SiteMap;
