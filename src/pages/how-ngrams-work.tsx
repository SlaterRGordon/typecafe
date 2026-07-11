import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";

import { DocumentPage, DocumentSection } from "~/components/legal/DocumentPage";

// Companion to /how-to-type-faster: a search-intent explainer for "n-grams"
// (bigrams/trigrams) that doubles as a demo of Grams mode. Each section ends in
// a link to the surface that uses n-grams, feeding internal links (growth-seo §E).
const HowNgramsWork: NextPage = () => {
  // GEO structured data: FAQPage for direct-answer citation, Article to mark
  // the page as citable content. Answers mirror the prose below.
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is an n-gram?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "An n-gram is a short run of n characters. A two-letter run is a bigram (th, er, in), a three-letter run is a trigram (ing, the, ion), and a four-letter run is a tetragram (tion, ther). Every word is a chain of overlapping n-grams, so any text breaks down into a small vocabulary of sequences you type over and over.",
        },
      },
      {
        "@type": "Question",
        name: "Why does drilling common n-grams make you type faster?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Language is lopsided: a small set of sequences like th, he, in, er, and an makes up a huge share of everything you type, while most letter pairs almost never appear. Drilling the top few dozen sequences pays off on nearly every word. It also matches how motor memory forms, through repetition packed close together, which is when a sequence turns into a single chunked movement.",
        },
      },
      {
        "@type": "Question",
        name: "What are the most common bigrams in English?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "The most frequent English bigrams include th, he, in, er, an, re, on, at, and nd. A couple dozen sequences like these appear constantly, which is why practising them carries over to nearly everything you type.",
        },
      },
      {
        "@type": "Question",
        name: "Is it better to drill n-grams or type full paragraphs?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Drilling targeted n-grams is more efficient. Most of a paragraph is sequences you already own, so retyping it spends most of your effort on moves you have mastered. Short, dense reps on the handful of transitions that are actually slow build the chunk faster than general typing that only touches them a few times.",
        },
      },
    ],
  };

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "How N-grams Work for Typing Practice (and Why)",
    description:
      "What an n-gram is, how drilling one works, and why targeted sequence practice makes you type faster.",
    author: { "@type": "Organization", name: "TypeCafe" },
    publisher: { "@type": "Organization", name: "TypeCafe" },
    datePublished: "2026-07-06",
    dateModified: "2026-07-06",
    mainEntityOfPage: "https://typecafe.app/how-ngrams-work",
  };

  return (
    <>
      <Head>
        <title>How N-grams Work for Typing Practice (and Why) | TypeCafe</title>
        <meta
          name="description"
          content="An n-gram is a short letter sequence like th, ing, or tion. Drilling the most common ones works because a tiny set of sequences makes up most of what you type. Here's how and why."
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }}
        />
      </Head>
      <DocumentPage
        eyebrow="Guide"
        title="How N-grams Work"
        updated="July 6, 2026"
        intro="You don't type letters one at a time. You type in short, practised bursts, sequences like th, ing, and tion that your fingers fire as a single move. Those sequences are n-grams, and they are the reason targeted practice beats grinding random paragraphs. Here is what an n-gram is, how drilling one works, and why it makes you faster."
      >
        <DocumentSection title="What an n-gram actually is">
          <p>An <strong>n-gram</strong> is just a short run of <em>n</em> characters. A two-letter run is a <strong>bigram</strong> (<code>th</code>, <code>er</code>, <code>in</code>); a three-letter run is a <strong>trigram</strong> (<code>ing</code>, <code>the</code>, <code>ion</code>); a four-letter run is a <strong>tetragram</strong> (<code>tion</code>, <code>ther</code>). The &quot;n&quot; just stands in for the length.</p>
          <p>Every word is a chain of overlapping n-grams. <code>faster</code> is the bigrams <code>fa&nbsp;·&nbsp;as&nbsp;·&nbsp;st&nbsp;·&nbsp;te&nbsp;·&nbsp;er</code>, or the trigrams <code>fas&nbsp;·&nbsp;ast&nbsp;·&nbsp;ste&nbsp;·&nbsp;ter</code>. Break any text down this way and you stop seeing 26 letters and start seeing a much smaller vocabulary of sequences you type over and over.</p>
        </DocumentSection>

        <DocumentSection title="Why your speed lives in the sequences, not the letters">
          <p>Once you can hit every key, individual letters stop being the bottleneck. What slows you down is the <em>handoff</em> from one key to the next, the <Link href="/how-we-measure">transition</Link>. Some transitions are smooth because they alternate hands or roll across neighbouring fingers (<code>th</code>, <code>er</code>); others force one finger to double back or the same hand to contort (<code>ol</code>, <code>my</code>, <code>br</code>).</p>
          <p>Fast typists aren&apos;t moving each finger faster. They&apos;ve turned the common sequences into single motor gestures, the way a pianist plays a chord instead of four separate notes. That&apos;s <strong>chunking</strong>: your brain stops sending &quot;i, then n, then g&quot; and starts sending one &quot;ing.&quot; N-grams are the unit that chunk is built from.</p>
          <p><Link href="/progress">See which transitions are costing you time on your progress page →</Link></p>
        </DocumentSection>

        <DocumentSection title="Why drilling the common ones pays off">
          <p>Language is lopsided. A small set of n-grams makes up a huge share of everything you type, <code>th</code>, <code>he</code>, <code>in</code>, <code>er</code>, <code>an</code>, and a couple dozen others appear constantly, while most possible letter pairs almost never do. So practice does not divide evenly across the keyboard: nailing the top few dozen sequences pays off on nearly every word, while a rare pair you fumble barely costs you.</p>
          <p>That&apos;s the whole efficiency argument for n-gram drilling. Instead of retyping full paragraphs, most of which is sequences you already own, you do short, dense reps on exactly the handful of transitions that are slow. A minute spent smoothing <code>ol</code> and <code>br</code> buys more real speed than ten minutes of general typing that only touches them a few times.</p>
          <p>It works because of how motor memory is built: <strong>repetition close together</strong>. Drilling packs dozens of reps of the same move into a short window, which is exactly the condition under which a sequence turns into a chunk.</p>
        </DocumentSection>

        <DocumentSection title="How TypeCafe drills n-grams">
          <p>Grams mode is built on this idea. You pick a <strong>source</strong> (bigrams, trigrams, tetragrams, or whole words) and a <strong>scope</strong> (the top 50, 100, or 200 most common sequences). TypeCafe then feeds you those sequences in short levels rather than random text.</p>
          <p>It&apos;s a <em>progression</em>, not a static drill. Each level has a speed and accuracy target; clear it and you advance to the next sequence, with your running WPM tracked across the ladder. You&apos;re never grinding, you&apos;re climbing through the exact sequences that carry your typing, one mastered chunk at a time.</p>
          <p><Link href="/">Switch to Grams mode and try it →</Link></p>
        </DocumentSection>

        <DocumentSection title="Then drill your own weak sequences">
          <p>The top-50 list is a great start, but your slow transitions aren&apos;t everyone&apos;s. After a test, TypeCafe reads your keystroke timeline and finds the transitions <em>you</em> lose time on, then builds a drill saturated with exactly those pairs. That&apos;s the difference between practising common sequences and practising <em>your</em> costly ones.</p>
          <p>Then re-measure. Run a normal test again and watch the transition drop off your weak list and the WPM delta move. If it moved, the drill worked; if not, drill something else. That diagnose → drill → re-measure loop is the whole point, n-grams are just the material it runs on.</p>
          <p><Link href="/how-to-type-faster">See the full get-faster loop these drills plug into →</Link></p>
        </DocumentSection>
      </DocumentPage>
    </>
  );
};

export default HowNgramsWork;
