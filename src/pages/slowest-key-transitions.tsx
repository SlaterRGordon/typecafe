import type { NextPage } from "next";
import Link from "next/link";

import { GuideSeo } from "~/components/guides/GuideSeo";
import { DocumentPage, DocumentSection } from "~/components/legal/DocumentPage";

const questions = [
  {
    question: "What is a key transition in typing?",
    answer: "A key transition is the movement from one keystroke to the next, such as r to v or space to t. Transition timing measures the delay between those presses and can reveal a slow movement even when both keys are accurate individually.",
  },
  {
    question: "What is the difference between a weak key and a slow transition?",
    answer: "A weak key is inaccurate or slow across many contexts. A slow transition is a specific pair that breaks down only when one key follows another. Per-key accuracy finds the first problem; keystroke timing is needed to find the second.",
  },
  {
    question: "How should I practise a slow key transition?",
    answer: "Practise real words containing the pair at a relaxed accurate pace, gradually connect the pair into one movement, and then re-test it in ordinary text. Prioritize common slow pairs because improving a rare sequence has little effect on overall speed.",
  },
];

const TransitionGuide: NextPage = () => (
  <>
    <GuideSeo
      title="Find Your Slowest Key Transitions and Type Faster | TypeCafe"
      headline="Find Your Slowest Key Transitions"
      description="Weak keys tell only half the story. Learn how key-transition timing finds the letter pairs that interrupt your typing flow and how to drill them."
      path="/slowest-key-transitions"
      questions={questions}
    />
    <DocumentPage
      eyebrow="Typing diagnosis guide"
      title="Find Your Slowest Key Transitions"
      updated="July 12, 2026"
      intro="Your letters can all be accurate and your typing can still feel stuck. That is because words are not a bag of individual keys. They are a chain of movements, and the handoff from one key to the next is often where the time disappears."
    >
      <DocumentSection title="The short answer">
        <p><strong>A key transition is the movement from one keystroke to the next.</strong> If <code>r→v</code> takes much longer than your normal transition, that pair interrupts your flow even when your standalone <code>r</code> and <code>v</code> accuracy looks excellent.</p>
        <p>Weak-key analysis asks which keys you miss. Transition analysis asks where you wait. Intermediate typists need both answers.</p>
        <p><Link href="/">Take a test and measure your own transitions →</Link></p>
      </DocumentSection>

      <DocumentSection title="Why per-key accuracy misses the problem">
        <p>Suppose your <code>b</code> accuracy is 99%. A heatmap paints it green. But perhaps <code>m→b</code> forces an awkward same-hand reach, while <code>a→b</code> feels effortless. Averaging every use of <code>b</code> hides the costly context.</p>
        <p>This is the same reason a pianist can play two notes cleanly in isolation and stumble when they appear together. The sequence is a skill of its own.</p>
      </DocumentSection>

      <DocumentSection title="How transition timing works">
        <p>A keystroke timeline records when each key is pressed. Subtract one timestamp from the next and you get the transition time. TypeCafe groups repeated pairs, ignores samples that do not have enough evidence, and compares each pair with your typical pace.</p>
        <p>The result is relative, not a universal judgement. A <code>c→r</code> transition shown as 1.8× average means it takes about 80% longer than your normal movement in that body of tests. It does not mean everyone should type the pair at one prescribed speed.</p>
        <p><Link href="/how-we-measure">Read how TypeCafe calculates and qualifies its measurements →</Link></p>
      </DocumentSection>

      <DocumentSection title="Not every slow pair deserves practice">
        <p>A rare transition can sit at the top of a slow list and barely affect WPM. Frequency matters. Improving <code>t→h</code>, <code>i→n</code>, or a common space boundary transfers to many sentences; polishing a pair you encounter once a month is mostly trivia.</p>
        <p>Prioritize transitions that are both slow and common in the language or material you actually type. Programmers may care about symbols and punctuation that ordinary prose barely uses. A Colemak typist will face different physical movements from a QWERTY typist even when the text is identical.</p>
      </DocumentSection>

      <DocumentSection title="How to drill a transition without learning nonsense">
        <p>Repeating <code>rv rv rv</code> can help you feel the motion, but it should be a warm-up, not the whole drill. Your fingers need to recognize the pair inside words, with realistic letters arriving before and after it.</p>
        <ol>
          <li>Begin with a few deliberate repetitions of the pair.</li>
          <li>Move to familiar words that contain it.</li>
          <li>Keep accuracy high enough that the correct movement repeats.</li>
          <li>Use short phrases so the pair survives normal rhythm and spaces.</li>
          <li>Re-test in unseen text and check whether its relative delay fell.</li>
        </ol>
        <p><Link href="/drill">Open the targeted drill surface →</Link></p>
      </DocumentSection>

      <DocumentSection title="Measure the movement, then measure the outcome">
        <p>A transition getting faster is encouraging, but the product outcome is sustainable WPM. Watch both. If a drill improves the pair without moving your daily trend, it may not have been frequent enough to matter—or another bottleneck may now be exposed.</p>
        <p>That is normal. Diagnosis is not a one-time label. As one weak spot improves, the next limiting movement becomes easier to see.</p>
        <p><Link href="/progress">See whether your drills are moving the daily trend →</Link></p>
      </DocumentSection>
    </DocumentPage>
  </>
);

export default TransitionGuide;
