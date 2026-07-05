/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
await import("./src/env.mjs");

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: false,
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // The dev-tools indicator renders bottom-left over the side rail's More
  // button and swallows its clicks (breaks e2e; annoying for humans too).
  devIndicators: false,

  // Ensure the Roboto Mono TTFs the OG image route reads at runtime are bundled
  // into its serverless function (they are read from disk, not imported).
  outputFileTracingIncludes: {
    "/api/og/score/[slug]": ["./src/server/og/fonts/**"],
  },

  // Force Google to consolidate on the custom domain: a 308 beats the canonical
  // hint. Vercel serves prod on both typecafe.app and <project>.vercel.app.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "(.*)\\.vercel\\.app" }],
        destination: "https://typecafe.app/:path*",
        permanent: true,
      },
    ];
  },

  images: {
    remotePatterns: [{
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.buymeacoffee.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.ko-fi.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.public.blob.vercel-storage.com',
        port: '',
        pathname: '/**',
      }
    ]
  },
};
export default config;
