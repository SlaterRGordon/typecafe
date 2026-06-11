import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

export default function Document() {
    return (
        <Html data-theme="dark">
            <Head>
                {/* Site-wide OG/description defaults live in _app.tsx (via next/head)
                    so individual pages can override them by key. Keep only static,
                    non-overridable tags here. */}
                <meta name="keywords" content="typing, test, asthetic, minimalistic, keyboard, speed, leaderboard, track" />
                <link rel="shortcut icon" href="/images/TypeCafeIcon.ico" />
                <link rel="icon" type="image/png" sizes="16x16" href="/images/TypeCafe16x16.png"/>
                <link rel="icon" type="image/png" sizes="32x32" href="/images/TypeCafe32x32.png"/>
                <link rel="icon" type="image/png" sizes="64x64" href="/images/TypeCafe64x64.png"/>
                <meta name="google-site-verification" content="k7imjzARc_FR0VJoclkwODcjF6-MSxaWKYO_N4hHg2w" />
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
