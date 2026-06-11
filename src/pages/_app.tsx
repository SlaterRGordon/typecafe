import { type AppType } from "next/app";
import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

import { api } from "~/utils/api";

import "~/styles/globals.css";
import Layout from "~/components/Layout";
import { store } from '../state/store';
import { Provider } from 'react-redux';
import Head from "next/head";

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <Provider store={store}>
      <SessionProvider session={session}>
        <Layout>
          <Head>
            <title>Type Cafe</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            {/* Site-wide defaults. Keyed so individual pages can override any of
                these with a next/head tag using the same key. */}
            <meta key="description" name="description" content="TypeCafe is a user-centered typing test with a clean, asthetic feel. Level up your typing and track your progress." />
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
      </SessionProvider>
    </Provider>
  );
};

export default api.withTRPC(MyApp);
