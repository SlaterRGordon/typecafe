import { Html, Head, Main, NextScript } from "next/document";
import Script from "next/script";

export default function Document() {
    return (
        <Html data-theme="dark">
            <Head>
                <meta name="description" content="TypeCafe is a user-centered typing test with a clean, asthetic feel. Level up your typing and track your progress." />
                <meta name="keywords" content="typing, test, asthetic, minimalistic, keyboard, speed, leaderboard, track" />
                <meta property="og:title" content="Title Here" />
                <meta property="og:description" content="TypeCafe is a user-centered typing test with a clean, asthetic feel. Level up your typing and track your progress." />
                <meta property="og:image" content="/images/preview-image.png" />
                <link rel="shortcut icon" href="/images/TypeCafeIcon.ico" />
                <link rel="icon" type="image/png" sizes="16x16" href="/images/TypeCafe16x16.png"/>
                <link rel="icon" type="image/png" sizes="32x32" href="/images/TypeCafe32x32.png"/>
                <link rel="icon" type="image/png" sizes="64x64" href="/images/TypeCafe64x64.png"/>
                <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-9035590557240587" crossOrigin="anonymous"></script>
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
