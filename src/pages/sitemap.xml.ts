import type { GetServerSidePropsContext } from "next";
import { prisma } from "~/server/db";
import { GUIDE_ROUTES } from "~/lib/guides";

const EXTERNAL_DATA_URL = "https://typecafe.app";

// Real lastmod dates. Emitting `new Date()` on every fetch tells Google every
// page changed "just now" on every crawl, so it learns to ignore the field.
// Bump this when static/guide content meaningfully changes.
const STATIC_LASTMOD = "2026-07-20";

interface User {
    username: string;
    lastmod: string;
}

// Keep this allowlist explicit. Filesystem discovery accidentally turns dynamic
// pages such as `/score/[slug]` into crawl URLs, while private/authenticated
// surfaces should not be advertised as public landing pages.
export const STATIC_ROUTES = [
    "/",
    "/practice",
    "/train",
    "/progress",
    "/leaderboard",
    "/challenge",
    "/guides",
    "/how-to-type-faster",
    "/how-ngrams-work",
    "/keyboard-layouts",
    "/stuck-at-60-70-wpm",
    "/spacebar-slowing-down-typing",
    "/slowest-key-transitions",
    "/15-second-vs-60-second-wpm",
    "/typing-consistency",
    "/how-we-measure",
    "/support",
    "/contact",
    "/privacy-policy",
    "/terms-and-conditions",
] as const;

function priorityFor(route: string): { priority: string; changefreq: string } {
    if (route === "/") return { priority: "1.0", changefreq: "daily" };
    if (route.startsWith("/profile/")) return { priority: "0.6", changefreq: "weekly" };
    if (route === "/guides" || GUIDE_ROUTES.includes(route)) {
        return { priority: "0.7", changefreq: "monthly" };
    }
    if (["/progress", "/practice", "/train"].includes(route)) {
        return { priority: "0.5", changefreq: "weekly" };
    }
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

export function generateSiteMap(staticRoutes: readonly string[], users: User[]) {
    const staticEntries = staticRoutes.map((route) => {
        const { priority, changefreq } = priorityFor(route);
        return urlEntry(`${EXTERNAL_DATA_URL}${route}`, STATIC_LASTMOD, priority, changefreq);
    });

    const profileEntries = users
        .filter(({ username }) => username.trim())
        .map(({ username, lastmod }) => urlEntry(`${EXTERNAL_DATA_URL}/profile/${encodeURIComponent(username.trim())}`, lastmod, "0.6", "weekly"));

    // Per-score share pages are noindex,follow (growth-seo §C) - social cards,
    // not search landing pages - so they're deliberately absent here.
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${[...staticEntries, ...profileEntries].join('')}
</urlset>`;
}

function SiteMap() {
    // getServerSideProps will do the heavy lifting
}

export async function getServerSideProps({ res }: GetServerSidePropsContext) {
    const users = await prisma.user.findMany({
        select: {
            username: true,
            // Latest test = a real "profile last changed" signal, no schema migration needed.
            tests: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 },
        },
    });

    const sanitizedUsers: User[] = users.flatMap((user) =>
        user.username
            ? [{ username: user.username, lastmod: (user.tests[0]?.createdAt ?? new Date(STATIC_LASTMOD)).toISOString() }]
            : [],
    );

    const sitemap = generateSiteMap(STATIC_ROUTES, sanitizedUsers);

    res.setHeader('Content-Type', 'text/xml');
    res.write(sitemap);
    res.end();

    return { props: {} };
}

export default SiteMap;
