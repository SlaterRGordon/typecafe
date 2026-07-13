export interface GuideSummary {
  href: string;
  title: string;
  description: string;
}

export const GUIDES: GuideSummary[] = [
  {
    href: "/stuck-at-60-70-wpm",
    title: "Stuck at 60–70 WPM?",
    description:
      "If your accuracy is already high, more generic practice is not the answer. Find the transitions, pauses, and habits that are actually holding you there.",
  },
  {
    href: "/spacebar-slowing-down-typing",
    title: "Is Your Spacebar Slowing You Down?",
    description:
      "The pause between words can quietly cap your speed. Learn how to spot a slow space transition and smooth it out without mashing the key faster.",
  },
  {
    href: "/slowest-key-transitions",
    title: "Find Your Slowest Key Transitions",
    description:
      "A key can be accurate on its own and still be slow after another key. See why transition timing often reveals more than a weak-key list.",
  },
  {
    href: "/15-second-vs-60-second-wpm",
    title: "15-Second vs. 60-Second WPM",
    description:
      "Why short tests produce bigger numbers, which score is closer to your sustainable speed, and how to compare results without fooling yourself.",
  },
  {
    href: "/typing-consistency",
    title: "What Typing Consistency Actually Means",
    description:
      "Consistency is useful, but one percentage can hide the reason your pace changed. Learn what to watch and what to practise next.",
  },
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

export const GUIDE_ROUTES = GUIDES.map((guide) => guide.href);
