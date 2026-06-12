import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
    return (
        <Html lang="en" data-theme="dark">
            <Head>
                {/* Site-wide OG/description defaults live in _app.tsx (via next/head)
                    so individual pages can override them by key. Keep only static,
                    non-overridable tags here. */}
                <meta name="keywords" content="typing, test, aesthetic, minimalistic, keyboard, speed, leaderboard, track" />
                <meta name="theme-color" content="#1b1d29" />
                <link rel="manifest" href="/manifest.json" />
                <link rel="shortcut icon" href="/images/TypeCafeIcon.ico" />
                <link rel="icon" type="image/png" sizes="16x16" href="/images/TypeCafe16x16.png"/>
                <link rel="icon" type="image/png" sizes="32x32" href="/images/TypeCafe32x32.png"/>
                <link rel="icon" type="image/png" sizes="64x64" href="/images/TypeCafe64x64.png"/>
                <meta name="google-site-verification" content="k7imjzARc_FR0VJoclkwODcjF6-MSxaWKYO_N4hHg2w" />
            </Head>
            <body className="overflow-hidden">
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
