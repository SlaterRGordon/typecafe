import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";

// The guides hub: one index page that lists every guide article as a card, so
// the nav carries a single stable "Guides" link and adding an article means
// adding a card here - never a new nav item. As a page that internally links
// all guides it's also a GEO/SEO asset in its own right (growth-seo §E).

// Single source of truth for the guide list: the cards below, the ItemList
// JSON-LD, and the side nav's active-state check all read from it.
export const GUIDES = [
  {
    href: "/how-to-type-faster",
    title: "How to Type Faster",
    description:
      "Fix accuracy first, drill the exact keys and transitions that slow you down, and measure the delta. The whole method, step by step.",
  },
  {
    href: "/how-ngrams-work",
    title: "How N-grams Work",
    description:
      "You type in practised bursts like th and ing, not single letters. What an n-gram is, and why drilling them beats grinding random paragraphs.",
  },
  {
    href: "/keyboard-layouts",
    title: "Keyboard Layouts Explained",
    description:
      "QWERTY, Dvorak, Colemak and friends compared: what each layout actually changes, and whether switching makes you faster.",
  },
];

const Guides: NextPage = () => {
  // GEO structured data: a CollectionPage with an ItemList gives crawlers and
  // answer engines a clean map of every guide from one URL.
  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "TypeCafe Typing Guides",
    description:
      "Practical, measurable guides to typing faster: method, n-grams, and keyboard layouts.",
    url: "https://typecafe.app/guides",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: GUIDES.map((guide, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: guide.title,
        url: `https://typecafe.app${guide.href}`,
      })),
    },
  };

  return (
    <>
      <Head>
        <title>Typing Guides: Practical Ways to Get Faster | TypeCafe</title>
        <meta
          name="description"
          content="Every TypeCafe guide in one place: how to type faster, how n-gram drills work, and what keyboard layouts actually change. Practical and measurable, no fluff."
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }}
        />
      </Head>
      {/* Same shell as DocumentPage, but the body is a card grid instead of
          prose - document-content's link styling would fight the cards. */}
      <main className="h-full w-full overflow-y-auto bg-base-100">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <header className="border-b border-base-300 pb-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Guides</p>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-base-content sm:text-4xl">Typing Guides</h1>
            <p className="mt-6 max-w-3xl text-base leading-7 text-base-content/80">
              Everything we&apos;ve written about getting faster, in one place. Each guide is practical and measurable: what to do, why it works, and where TypeCafe does it for you.
            </p>
          </header>
          <div className="grid grid-cols-1 gap-4 pb-16 sm:grid-cols-2" data-testid="guides-grid">
            {GUIDES.map((guide) => (
              <Link
                key={guide.href}
                href={guide.href}
                className="group flex flex-col gap-2 rounded-lg border border-base-content/10 bg-base-200 p-5 transition-colors hover:border-primary/40 hover:bg-base-300"
              >
                <h2 className="text-lg font-bold text-base-content">{guide.title}</h2>
                <p className="text-sm leading-6 text-base-content/70">{guide.description}</p>
                <span className="mt-auto pt-2 text-sm font-semibold text-primary">Read the guide →</span>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
};

export default Guides;
