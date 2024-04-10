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
          </Head>
          <Component {...pageProps} />
        </Layout>
      </SessionProvider>
    </Provider>
  );
};

export default api.withTRPC(MyApp);
