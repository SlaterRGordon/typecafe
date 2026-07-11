import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
    return (
        <Html lang="en" data-theme="dark">
            <Head>
                {/* Site-wide OG/description defaults live in _app.tsx (via next/head)
                    so individual pages can override them by key. Keep only static,
                    non-overridable tags here. */}
                <meta name="keywords" content="typing coach, typing practice, typing test, targeted typing drills, WPM, accuracy, progress" />
                <meta name="theme-color" content="#1b1d29" />
                <link rel="manifest" href="/manifest.json" />
                <link rel="shortcut icon" href="/images/TypeCafeIcon.ico" />
                <link rel="icon" type="image/png" sizes="16x16" href="/images/TypeCafe16x16.png"/>
                <link rel="icon" type="image/png" sizes="32x32" href="/images/TypeCafe32x32.png"/>
                <link rel="icon" type="image/png" sizes="64x64" href="/images/TypeCafe64x64.png"/>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" />
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />
                <meta name="google-site-verification" content="k7imjzARc_FR0VJoclkwODcjF6-MSxaWKYO_N4hHg2w" />
                {/* Site-wide entity markup so Google can build the brand entity
                    (helps the brand-term result + sitelinks). No SearchAction —
                    there's no site-search endpoint to back it (growth-seo §D). */}
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify([
                            {
                                "@context": "https://schema.org",
                                "@type": "WebSite",
                                name: "TypeCafe",
                                url: "https://typecafe.app",
                            },
                            {
                                "@context": "https://schema.org",
                                "@type": "Organization",
                                name: "TypeCafe",
                                url: "https://typecafe.app",
                                logo: "https://typecafe.app/images/TypeCafe64x64.png",
                            },
                        ]),
                    }}
                />
            </Head>
            <body className="overflow-hidden">
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
