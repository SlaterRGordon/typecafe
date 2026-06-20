import { type AppType } from "next/app";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

import { api } from "~/utils/api";

import "~/styles/globals.css";
import Layout from "~/components/Layout";
import { ProgressHistorySync } from "~/components/progress/ProgressHistorySync";
import { store } from '../state/store';
import { Provider } from 'react-redux';
import Head from "next/head";
import Script from "next/script";

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <Provider store={store}>
      <SessionProvider session={session}>
        <ProgressHistorySync />
        <Layout>
          <Head>
            <title>Type Cafe</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            {/* Site-wide defaults. Keyed so individual pages can override any of
                these with a next/head tag using the same key. */}
            <meta key="description" name="description" content="TypeCafe is a user-centered typing test with a clean, aesthetic feel. Level up your typing and track your progress." />
            <link key="canonical" rel="canonical" href="https://typecafe.app" />
            <meta key="og:site_name" property="og:site_name" content="TypeCafe" />
            <meta key="og:url" property="og:url" content="https://typecafe.app" />
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
