import type { NextPage } from "next";
import Head from "next/head";
import Link from "next/link";

import { DocumentPage, DocumentSection } from "~/components/legal/DocumentPage";

// GEO-oriented companion to /how-to-type-faster: a question-led explainer of
// keyboard layouts (QWERTY, Dvorak, Colemak, Workman, AZERTY, QWERTZ). Written
// so generative engines can lift a direct answer per heading, backed by a
// FAQPage + Article JSON-LD block. Each section ends in a link into the product
// (growth-seo §E), so the guide doubles as a demo and feeds internal links.

// One source of truth for the on-page comparison table and the FAQ answer about
// which layout is fastest, so the prose and the structured data never drift.
const LAYOUTS = [
  {
    name: "QWERTY",
    year: "1873",
    origin: "Sholes typewriter",
    homeRow: "~32% of keystrokes",
    note: "The default on virtually every device. Not designed for speed, but universal.",
  },
  {
    name: "Dvorak",
    year: "1936",
    origin: "August Dvorak",
    homeRow: "~70% of keystrokes",
    note: "Vowels under the left hand, common consonants under the right. Maximises hand alternation.",
  },
  {
    name: "Colemak",
    year: "2006",
    origin: "Shai Coleman",
    homeRow: "~74% of keystrokes",
    note: "Keeps most QWERTY shortcuts and only moves 17 keys, so it is easier to switch to than Dvorak.",
  },
  {
    name: "Colemak-DH",
    year: "2015",
    origin: "Colemak community",
    homeRow: "~74% of keystrokes",
    note: "Tweaks Colemak to cut awkward index-finger stretches. Popular on ergonomic/split boards.",
  },
  {
    name: "Workman",
    year: "2010",
    origin: "OJ Bucao",
    homeRow: "~68% of keystrokes",
    note: "Optimises for finger travel and comfort over raw home-row percentage.",
  },
  {
    name: "AZERTY / QWERTZ",
    year: "1900s",
    origin: "France / Germany",
    homeRow: "~30% of keystrokes",
    note: "Regional QWERTY variants for French and German accents, not speed redesigns.",
  },
];

const KeyboardLayouts: NextPage = () => {
  // FAQPage schema: the exact Q→A pairs below, so an answer engine can cite a
  // direct response. Kept short and factual (GEO favours extractable answers).
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "What is the best keyboard layout for typing speed?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "No single layout is fastest for everyone. Alternative layouts like Dvorak and Colemak put ~70% of keystrokes on the home row versus roughly 32% for QWERTY, which can reduce finger travel and strain. But controlled studies show the speed ceiling is set by practice, not layout: a well-drilled QWERTY typist beats an untrained Dvorak typist. The biggest gains come from touch typing and targeted practice on your weak keys, whichever layout you use.",
        },
      },
      {
        "@type": "Question",
        name: "Is Dvorak or Colemak faster than QWERTY?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Dvorak and Colemak are more efficient by design (more home-row usage and hand alternation), but they are not automatically faster. Most typists who switch land at a similar speed to their old QWERTY speed after weeks of relearning; the main wins are comfort and reduced finger travel, not a large WPM jump.",
        },
      },
      {
        "@type": "Question",
        name: "Should I switch keyboard layouts to type faster?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "For most people, no. Switching costs weeks of relearning and does not raise your speed ceiling. Consider Colemak or Colemak-DH mainly for comfort or to relieve strain. If your goal is pure speed, staying on QWERTY and drilling your specific slow keys and transitions is the faster path.",
        },
      },
      {
        "@type": "Question",
        name: "What is the difference between Colemak and Colemak-DH?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Colemak-DH is a modern tweak of Colemak that moves the D and H keys to cut awkward index-finger stretches. It is especially popular on ergonomic and split keyboards. Standard Colemak keeps the original positions and preserves more QWERTY shortcuts.",
        },
      },
    ],
  };

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Keyboard Layouts Explained: QWERTY vs Dvorak vs Colemak",
    description:
      "A practical, evidence-based comparison of keyboard layouts and whether switching makes you type faster.",
    author: { "@type": "Organization", name: "TypeCafe" },
    publisher: { "@type": "Organization", name: "TypeCafe" },
    datePublished: "2026-07-11",
    dateModified: "2026-07-11",
    mainEntityOfPage: "https://typecafe.app/keyboard-layouts",
  };

  return (
    <>
      <Head>
        <title>Keyboard Layouts Explained: QWERTY vs Dvorak vs Colemak | TypeCafe</title>
        <meta
          name="description"
          content="QWERTY, Dvorak, Colemak, Workman, AZERTY: what each layout is, how they compare, and whether switching actually makes you type faster. An evidence-based guide."
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
        title="Keyboard Layouts Explained"
        updated="July 11, 2026"
        intro="QWERTY, Dvorak, Colemak, Workman: keyboard layouts decide which finger types which letter. Alternative layouts move common letters onto the home row to cut finger travel, and the usual question is whether switching makes you faster. The short version: a layout changes how comfortable typing feels far more than how fast you can go, and speed is set by practice. Here is what each layout is, how they compare, and what actually moves your numbers."
      >
        <DocumentSection title="What is a keyboard layout?">
          <p>A <strong>keyboard layout</strong> is the mapping of letters and symbols to the physical keys. The same slab of keys can produce QWERTY, Dvorak, or Colemak depending purely on which character each key sends. Layouts differ mainly in where they put the most common letters: the more of your typing that lands on the <strong>home row</strong> (<code>asdf</code> / <code>jkl;</code>), the less your fingers have to travel.</p>
          <p>The name comes from the first six letters of the top row. QWERTY was designed in 1873 for a mechanical typewriter, not for speed, and it stuck because everyone already knew it. Alternative layouts were later designed to reduce finger travel and balance work between the hands.</p>
        </DocumentSection>

        <DocumentSection title="Keyboard layouts compared">
          <p>Here is how the common layouts stack up. &quot;Home row&quot; is the rough share of English keystrokes that fall on the home row, a standard proxy for how little your fingers move.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-base-300">
                  <th className="py-2 pr-4 font-semibold text-base-content">Layout</th>
                  <th className="py-2 pr-4 font-semibold text-base-content">Introduced</th>
                  <th className="py-2 pr-4 font-semibold text-base-content">Home row</th>
                  <th className="py-2 font-semibold text-base-content">What it&apos;s for</th>
                </tr>
              </thead>
              <tbody>
                {LAYOUTS.map((l) => (
                  <tr key={l.name} className="border-b border-base-300 align-top">
                    <td className="py-2 pr-4 font-semibold text-base-content">{l.name}</td>
                    <td className="py-2 pr-4 text-base-content/70">{l.year}</td>
                    <td className="py-2 pr-4 text-base-content/70">{l.homeRow}</td>
                    <td className="py-2 text-base-content/70">{l.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Home-row percentages come from analysing common English text and vary a little by corpus, but the ordering is stable: the alternative layouts keep far more typing on the home row than QWERTY.</p>
        </DocumentSection>

        <DocumentSection title="What is the best keyboard layout for typing speed?">
          <p><strong>There is no single fastest layout for everyone.</strong> By design, Dvorak and Colemak are more efficient: they put roughly 70% of keystrokes on the home row versus about 32% for QWERTY, so your fingers move less and the hands share the work more evenly. That is a real ergonomic win.</p>
          <p>Efficiency on paper is not the same as speed in your hands, though. What sets your top speed is practice, not the layout underneath it. Give a well-drilled QWERTY typist and an untrained Dvorak typist the same paragraph and the QWERTY typist wins every time. A better layout makes typing more comfortable; it does not raise your ceiling. Drilling does.</p>
          <p><Link href="/how-to-type-faster">See what actually makes you faster on any layout →</Link></p>
        </DocumentSection>

        <DocumentSection title="Should I switch keyboard layouts?">
          <p>For most people, <strong>no</strong>, at least not for speed. Switching layouts means weeks of relearning during which your typing crawls, and the evidence is that most switchers land back around their old QWERTY speed rather than well above it. The honest reasons to switch are <strong>comfort and strain</strong>, not a big WPM jump.</p>
          <p>If your hands ache after long sessions, an alternative layout that keeps more work on the home row can genuinely help. <strong>Colemak</strong> is the usual recommendation because it only moves 17 keys from QWERTY and preserves common shortcuts, making the switch far gentler than Dvorak. On ergonomic or split keyboards, <strong>Colemak-DH</strong> further reduces awkward finger stretches.</p>
          <p>If your goal is pure speed, the faster path is to stay on the layout you already know and drill the specific keys and transitions that slow <em>you</em> down.</p>
          <p><Link href="/">Measure your current speed and find your weak keys →</Link></p>
        </DocumentSection>

        <DocumentSection title="Why practice beats layout">
          <p>Your typing speed lives in <strong>motor memory</strong>, the chunked finger movements you make without thinking about them. You build that memory through repetition, and it is tied to the specific keys you have drilled. Switch layouts and you throw away years of it, then rebuild from zero. That is why the switch costs weeks: you are not learning to type, you are learning to type again.</p>
          <p>This is why targeted practice wins. You do not type slowly &quot;in general&quot;, you lose time on a handful of specific keys and letter <Link href="/how-ngrams-work">transitions</Link>. Fixing those pays off on nearly every word, on whatever layout you use, and it costs days rather than the weeks a full layout switch demands.</p>
          <p>TypeCafe reads your keystroke timeline after each test and names the exact keys and transitions costing you time, then builds a drill from them and measures the before→after delta. That diagnose → drill → re-measure loop is what moves your number, no layout change required.</p>
          <p><Link href="/train">Start the diagnose-drill-remeasure loop →</Link></p>
        </DocumentSection>

        <DocumentSection title="Which layout should a beginner learn?">
          <p>If you are learning to touch type from scratch, <strong>learn QWERTY</strong>. It is on every device you will ever borrow, every job you will ever have, and every phone. The single biggest speed gain for a beginner is not the layout, it is moving from hunting-and-pecking to real touch typing: fingers on the home row, each finger owning its columns, eyes on the screen.</p>
          <p>Only consider an alternative layout later, once you touch type comfortably and have a specific reason (usually comfort or strain) to switch. Chasing an &quot;optimal&quot; layout before you can touch type is optimising the wrong thing.</p>
          <p><Link href="/">Take your first test and start building motor memory →</Link></p>
        </DocumentSection>
      </DocumentPage>
    </>
  );
};

export default KeyboardLayouts;
