import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

export default function Document() {
    return (
        <Html data-theme="dark">
            <Head>
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
            </Head>
            <body className="overflow-hidden">
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}