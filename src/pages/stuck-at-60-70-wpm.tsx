import type { NextPage } from "next";
import Link from "next/link";

import { GuideSeo } from "~/components/guides/GuideSeo";
import { DocumentPage, DocumentSection } from "~/components/legal/DocumentPage";

const questions = [
  {
    question: "Why am I stuck at 60 to 70 WPM?",
    answer: "At 60 to 70 WPM, most typists already know every key. The usual bottleneck is no longer key location; it is a small set of slow letter transitions, pauses between words, uneven rhythm, or an accuracy problem that only appears when they push the pace.",
  },
  {
    question: "How do I get from 60 WPM to 80 WPM?",
    answer: "Take a representative test, identify the transitions or keys that cost the most time, drill those patterns in short focused sessions, then take another comparable test. Track your daily median rather than chasing one personal best.",
  },
  {
    question: "Should I keep focusing on accuracy if I already get 98 percent?",
    answer: "If you sustain about 97 to 98 percent accuracy, repeating generic accuracy practice is unlikely to reveal the whole bottleneck. Keep that accuracy floor, but investigate slow transitions, word-boundary pauses, and whether your pace collapses on unfamiliar text.",
  },
];

const StuckAtSixty: NextPage = () => (
  <>
    <GuideSeo
      title="Stuck at 60–70 WPM? How to Break the Plateau | TypeCafe"
      headline="Stuck at 60–70 WPM?"
      description="Already accurate but stuck around 60–70 WPM? Find the key transitions, pauses, and practice habits that are holding back your sustainable typing speed."
      path="/stuck-at-60-70-wpm"
      questions={questions}
    />
    <DocumentPage
      eyebrow="Typing plateau guide"
      title="Stuck at 60–70 WPM?"
      updated="July 12, 2026"
      intro="If you reached 60 WPM quickly and then stopped moving, you probably have not reached your natural limit. You have reached the point where broad advice stops being useful. You know where the keys are. Now you need to find the few movements that keep interrupting your flow."
    >
      <DocumentSection title="The short answer">
        <p><strong>A 60–70 WPM plateau is usually a diagnosis problem, not an effort problem.</strong> More random tests repeat thousands of movements you already perform well. The costly part may be six awkward transitions, a pause after every word, or a burst-and-brake rhythm that a single WPM number cannot explain.</p>
        <p>Take one normal test without trying to set a record. Use it to find where the time goes. Then drill that evidence, not your whole keyboard.</p>
        <p><Link href="/">Take a baseline test and find your weak spots →</Link></p>
      </DocumentSection>

      <DocumentSection title="First, check whether accuracy is actually the problem">
        <p>If your normal accuracy is below roughly 95%, slow down. Errors break rhythm and add correction time, so the apparent speed is not sustainable. Aiming for a clean 97–98% gives you a stable movement to speed up later.</p>
        <p>But if you already sit around 98%, “focus on accuracy” is incomplete advice. Do not turn every session into a hunt for 100%. Keep your accuracy floor and look for the moments where your hands hesitate even though they eventually hit the correct key.</p>
      </DocumentSection>

      <DocumentSection title="Look for transitions, not just weak letters">
        <p>You might type <code>r</code> accurately and type <code>v</code> accurately, yet consistently pause on <code>r→v</code>. That handoff is a <strong>key transition</strong>. It can be slow because the same finger must change direction, one hand is overloaded, or the pattern simply never became automatic.</p>
        <p>That is why a per-key accuracy chart is only half the story. At this speed, the useful question is often not “Which letter do I miss?” but “Which movement makes me wait?”</p>
        <p><Link href="/slowest-key-transitions">Learn how slow-transition diagnosis works →</Link></p>
      </DocumentSection>

      <DocumentSection title="Check the tiny pause between words">
        <p>Many intermediate typists can produce fast bursts inside familiar words, then stop for a fraction of a second before the next one. The fingers look fast, but the line never becomes fluid. Space is part of the transition: the movement into it and out to the first letter of the next word both matter.</p>
        <p>Do not solve this by striking the spacebar harder. Practise whole boundaries such as <code>e→space→t</code> or <code>g→space→a</code>, and begin reading the next word before the current word is finished.</p>
        <p><Link href="/spacebar-slowing-down-typing">See how to diagnose a slow spacebar transition →</Link></p>
      </DocumentSection>

      <DocumentSection title="Use a practice loop you can verify">
        <ol>
          <li><strong>Measure:</strong> take a representative 30- or 60-second test at your normal pace.</li>
          <li><strong>Diagnose:</strong> select one or two slow transitions, not a dozen.</li>
          <li><strong>Drill:</strong> spend two to five minutes on words containing those movements.</li>
          <li><strong>Re-measure:</strong> take another comparable test and check the transition timing as well as WPM.</li>
          <li><strong>Track the trend:</strong> compare daily medians so one lucky run does not masquerade as progress.</li>
        </ol>
        <p>That last step matters. You are trying to become reliably faster, not merely capable of one frantic score.</p>
        <p><Link href="/progress">See your daily WPM and accuracy trends →</Link></p>
      </DocumentSection>

      <DocumentSection title="A simple one-week plan">
        <p>On day one, establish a baseline and drill your two slowest common transitions. On the next three practice days, do one short drill followed by one normal test. On the final day, compare your daily median with the first tested day.</p>
        <p>If you skip Tuesday or Thursday, nothing is ruined. Motor learning does not care about filling a calendar. Return on the next available day and continue from the last measured baseline.</p>
        <p><Link href="/">Start with the test that gives you something specific to practise →</Link></p>
      </DocumentSection>
    </DocumentPage>
  </>
);

export default StuckAtSixty;
