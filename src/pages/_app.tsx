import { type AppType } from "next/app";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

import { api } from "~/utils/api";

import "~/styles/globals.css";
import Layout from "~/components/Layout";
import { GuestImport } from "~/components/GuestImport";
import { store } from '../state/store';
import { Provider } from 'react-redux';
import Head from "next/head";
import Script from "next/script";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { Analytics } from "@vercel/analytics/next"

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  const router = useRouter();

  // Self-canonicalize each page. A single hardcoded root canonical told Google
  // every page was a duplicate of the homepage, so content pages couldn't rank.
  // Pages that need a different canonical (e.g. /score/[slug]) still override by
  // the "canonical"/"og:url" key. Query/hash are stripped so ?params don't fork.
  const canonicalPath = router.asPath.split(/[?#]/)[0];
  const canonicalUrl = `https://typecafe.app${canonicalPath === "/" ? "" : canonicalPath}`;

  // GA4 only fires page_view on first load; SPA route changes need a manual hit.
  useEffect(() => {
    const onRouteChange = (url: string) => {
      window.gtag?.("event", "page_view", { page_path: url });
    };
    router.events.on("routeChangeComplete", onRouteChange);
    return () => router.events.off("routeChangeComplete", onRouteChange);
  }, [router.events]);

  return (
    <Provider store={store}>
      <SessionProvider session={session}>
        <Analytics/>
        <GuestImport />
        <Layout>
          <Head>
            <title>Type Cafe</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            {/* Site-wide defaults. Keyed so individual pages can override any of
                these with a next/head tag using the same key. */}
            <meta key="description" name="description" content="TypeCafe is a user-centered typing test with a clean, aesthetic feel. Level up your typing and track your progress." />
            <link key="canonical" rel="canonical" href={canonicalUrl} />
            <meta key="og:site_name" property="og:site_name" content="TypeCafe" />
            <meta key="og:url" property="og:url" content={canonicalUrl} />
            <meta key="og:type" property="og:type" content="website" />
            <meta key="og:title" property="og:title" content="TypeCafe — Test your typing speed" />
            <meta key="og:description" property="og:description" content="A user-centered typing test with a clean, aesthetic feel. Level up your typing and track your progress." />
            <meta key="og:image" property="og:image" content="https://typecafe.app/images/preview-image.png" />
            <meta key="twitter:card" name="twitter:card" content="summary_large_image" />
            <meta key="twitter:title" name="twitter:title" content="TypeCafe — Test your typing speed" />
            <meta key="twitter:description" name="twitter:description" content="A user-centered typing test with a clean, aesthetic feel. Level up your typing and track your progress." />
            <meta key="twitter:image" name="twitter:image" content="https://typecafe.app/images/preview-image.png" />
          </Head>
          <Component {...pageProps} />
        </Layout>
        {process.env.NEXT_PUBLIC_VERCEL_ENV === "production" && <>
          <Script
            src="https://www.googletagmanager.com/gtag/js?id=G-16KETVK938"
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-16KETVK938');
            `}
          </Script>
        </>}
      </SessionProvider>
    </Provider>
  );
};

export default api.withTRPC(MyApp);
