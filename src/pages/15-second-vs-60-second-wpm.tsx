import type { NextPage } from "next";
import Link from "next/link";

import { GuideSeo } from "~/components/guides/GuideSeo";
import { DocumentPage, DocumentSection } from "~/components/legal/DocumentPage";

const questions = [
  {
    question: "Why is my 15-second WPM higher than my 60-second WPM?",
    answer: "A 15-second test favors a good start, familiar words, and short bursts of effort. A 60-second test includes more opportunities for difficult words, errors, pauses, and fatigue, so it is usually lower and more representative of sustained copy typing.",
  },
  {
    question: "Is a 15-second typing test accurate?",
    answer: "It accurately measures that 15-second performance, but it is a noisy estimate of sustainable typing speed. Use it for burst practice or warm-ups, not as a direct substitute for a longer test.",
  },
  {
    question: "Which typing test length should I use to track improvement?",
    answer: "Use the same duration, text settings, language, and correction rules when comparing results. Thirty or sixty seconds is a practical balance for routine progress tracking, while longer tests are better for endurance and real-world pacing.",
  },
];

const TestLengthGuide: NextPage = () => (
  <>
    <GuideSeo
      title="15-Second vs. 60-Second WPM: Which Is Your Real Speed? | TypeCafe"
      headline="15-Second vs. 60-Second WPM"
      description="Short typing tests produce bigger WPM scores. Learn why 15-second and 60-second results differ, what each measures, and how to track real progress."
      path="/15-second-vs-60-second-wpm"
      questions={questions}
    />
    <DocumentPage
      eyebrow="Typing measurement guide"
      title="15-Second vs. 60-Second WPM"
      updated="July 12, 2026"
      intro="A 15-second personal best and a 60-second average are not competing answers to the same question. One captures your best burst. The other asks whether you can keep the movement together after the easy opening is gone."
    >
      <DocumentSection title="The short answer">
        <p><strong>Your 15-second WPM is usually higher because short tests reward burst speed and contain less chance for trouble.</strong> A good word list, a clean start, and fifteen seconds of concentration can produce a number you cannot sustain for a full minute.</p>
        <p>That does not make the short result fake. It makes it a different measurement.</p>
      </DocumentSection>

      <DocumentSection title="What a 15-second test measures well">
        <p>Short tests are useful for warming up, practising top-end movement, and seeing whether familiar patterns are becoming more automatic. They are also fun, which is not nothing. A quick personal best can pull you into another session.</p>
        <p>But the sample is small. One awkward word can sink the score, while one unusually friendly set can inflate it. There is little time for fatigue, attention drift, or a cluster of unfamiliar words to appear.</p>
      </DocumentSection>

      <DocumentSection title="What a 60-second test adds">
        <p>A minute asks more of your reading, rhythm, correction habits, and ability to recover after an error. It includes enough word boundaries and key combinations for repeated weaknesses to show themselves. For most people, it is a more stable picture of sustained copy typing.</p>
        <p>Longer is not automatically purer. A five-minute test includes endurance and comfort, which may be exactly what you care about—or an unwanted variable if you are evaluating a two-minute drill. Match the duration to the question.</p>
      </DocumentSection>

      <DocumentSection title="Your settings matter as much as the clock">
        <p>A 60-second test using 200 familiar words without punctuation is not equivalent to a 60-second quote full of capitals and uncommon vocabulary. Correction rules matter too: a test that lets errors remain measures something different from one that requires you to backspace and repair them.</p>
        <p>When comparing two scores, hold duration, language, text source, punctuation, and correction behaviour steady. Otherwise you may be measuring a settings change rather than improvement.</p>
        <p><Link href="/how-we-measure">See how TypeCafe defines WPM, accuracy, and ranked results →</Link></p>
      </DocumentSection>

      <DocumentSection title="Which number should you tell people?">
        <p>If someone asks casually, give the speed you can reproduce on a normal 60-second test, not the most flattering burst you have ever seen. If the distinction matters, include the duration: “90 WPM for 60 seconds” is clear and honest.</p>
        <p>For your own training, keep both. Burst speed shows the ceiling your hands can briefly reach. Sustainable speed shows how much of that ceiling you currently own.</p>
      </DocumentSection>

      <DocumentSection title="How to track improvement without chasing noise">
        <p>Do not compare today’s best 15-second run with last month’s median 60-second run. Choose a standard test and compare daily medians under the same settings. A median softens the effect of one lucky list or one bad interruption.</p>
        <p>Use short runs when you deliberately train speed. Return to the standard test afterward and ask whether the gain transferred. The second measurement is what turns a satisfying burst into evidence.</p>
        <p><Link href="/progress">Track your daily median instead of one personal best →</Link></p>
      </DocumentSection>

      <DocumentSection title="A practical default">
        <p>If you do not have a strong preference, use 30 or 60 seconds for routine tracking. It is long enough to expose real patterns and short enough to repeat without turning every session into an endurance event.</p>
        <p><Link href="/">Take a baseline test, diagnose it, and re-measure under the same conditions →</Link></p>
      </DocumentSection>
    </DocumentPage>
  </>
);

export default TestLengthGuide;
