import { globby } from "globby";
import type { GetServerSidePropsContext } from "next";
import { prisma } from "~/server/db";

const EXTERNAL_DATA_URL = "https://typecafe.app";

interface User {
    username: string;
}

interface ScoreShare {
    slug: string;
    createdAt: Date;
}

function priorityFor(route: string): { priority: string; changefreq: string } {
    if (route === "") return { priority: "1.0", changefreq: "daily" };
    if (route.startsWith("/profile/")) return { priority: "0.6", changefreq: "weekly" };
    if (route.startsWith("/score/")) return { priority: "0.4", changefreq: "never" };
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

function generateSiteMap(staticPages: string[], users: User[], shares: ScoreShare[]) {
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
        urlEntry(`${EXTERNAL_DATA_URL}/profile/${username}`, now, "0.6", "weekly")
    );

    const scoreEntries = shares.map(({ slug, createdAt }) =>
        urlEntry(`${EXTERNAL_DATA_URL}/score/${slug}`, createdAt.toISOString(), "0.4", "never")
    );

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${[...staticEntries, ...profileEntries, ...scoreEntries].join('')}
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

    const [users, shares] = await Promise.all([
        prisma.user.findMany({ select: { username: true } }),
        prisma.scoreShare.findMany({
            where: { deletedAt: null, expiresAt: null },
            select: { slug: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 5000,
        }),
    ]);

    const sanitizedUsers: User[] = users.map((user) => ({
        username: user.username ?? 'unknown',
    }));

    const sitemap = generateSiteMap(staticPages, sanitizedUsers, shares);

    res.setHeader('Content-Type', 'text/xml');
    res.write(sitemap);
    res.end();

    return { props: {} };
}

export default SiteMap;
