import type { NextPage } from "next";
import Link from "next/link";

import { GuideSeo } from "~/components/guides/GuideSeo";
import { DocumentPage, DocumentSection } from "~/components/legal/DocumentPage";

const questions = [
  {
    question: "What does consistency mean in typing?",
    answer: "Typing consistency describes how steadily you maintain your pace during a test. A consistent run has smaller speed swings, while an inconsistent run alternates between fast bursts, pauses, and recoveries.",
  },
  {
    question: "What is a good typing consistency score?",
    answer: "There is no universal good percentage because typing sites calculate consistency differently and text difficulty changes the result. Compare your score only under similar settings, and use the pace graph and accuracy to understand why it changed.",
  },
  {
    question: "How can I improve typing consistency?",
    answer: "Use a pace that preserves accuracy, read ahead, practise the specific words and transitions that create pauses, and gradually extend test duration. Aim for fewer avoidable stalls rather than forcing every word to be typed at identical speed.",
  },
];

const ConsistencyGuide: NextPage = () => (
  <>
    <GuideSeo
      title="What Typing Consistency Actually Means | TypeCafe"
      headline="What Typing Consistency Actually Means"
      description="Learn what a typing consistency score measures, why one percentage can mislead, and how to build a steadier pace without sacrificing accuracy."
      path="/typing-consistency"
      questions={questions}
    />
    <DocumentPage
      eyebrow="Typing measurement guide"
      title="What Typing Consistency Actually Means"
      updated="July 12, 2026"
      intro="Consistency sounds simple: type at the same speed from beginning to end. Real text makes that impossible. Some words are smooth, others are awkward, and an honest score has to separate normal variation from the stalls you can actually improve."
    >
      <DocumentSection title="The short answer">
        <p><strong>Typing consistency is a measure of how much your pace changes during a test.</strong> A steady run has modest variation. An uneven run jumps between fast bursts, hesitation, mistakes, and recovery.</p>
        <p>The percentage is a clue, not a diagnosis. It tells you that the pace changed, but usually not why.</p>
      </DocumentSection>

      <DocumentSection title="Why two equally skilled typists can get different scores">
        <p>Text difficulty is uneven. <code>the other time</code> will usually flow faster than an unfamiliar proper noun or a dense sequence of punctuation. A typist who responds naturally to those differences may look less mathematically consistent without having worse technique.</p>
        <p>Duration, word list, language, and the site’s formula also affect the number. There is no portable “90% is good” rule that works everywhere. Compare like with like: same test type, similar text, and the same correction settings.</p>
      </DocumentSection>

      <DocumentSection title="The pace graph explains what the percentage hides">
        <p>Look at the shape of the run. One isolated dip after a mistake is different from a drop at every word boundary. Repeated saw-tooth movement can mean you sprint through easy words and then wait. A steady decline may point to tension, fatigue, or a starting pace you could never sustain.</p>
        <p>This is where transition data helps. If the dips line up with the same key pairs, you have a drillable movement. If they appear after spaces, read-ahead and word-boundary practice may matter more.</p>
        <p><Link href="/slowest-key-transitions">Learn how transition timing identifies repeated stalls →</Link></p>
      </DocumentSection>

      <DocumentSection title="Consistency is not typing every word at one speed">
        <p>Hard words should take longer. Trying to force identical pace can create tension and errors, which is the opposite of useful consistency. The goal is to remove avoidable pauses while allowing the text to breathe.</p>
        <p>Think of a good run as controlled rather than robotic. You slow slightly for a difficult sequence, keep the movement accurate, and return to pace without a complete stop.</p>
      </DocumentSection>

      <DocumentSection title="How to build a steadier pace">
        <ol>
          <li><strong>Start slower than your burst speed.</strong> Choose a pace you can hold accurately for the full test.</li>
          <li><strong>Read ahead.</strong> Your hands should not finish a word and wait for your eyes.</li>
          <li><strong>Drill repeated stalls.</strong> Practise the transitions and word boundaries that create the largest dips.</li>
          <li><strong>Extend duration gradually.</strong> Own the pace for 30 seconds before demanding it for two minutes.</li>
          <li><strong>Stay relaxed.</strong> Tight hands often begin quickly and fade.</li>
        </ol>
        <p><Link href="/spacebar-slowing-down-typing">Check whether word-boundary pauses are breaking your rhythm →</Link></p>
      </DocumentSection>

      <DocumentSection title="Track daily momentum, not one opaque score">
        <p>A consistency score describes one run. Improvement is better judged across tested days: is your sustainable WPM rising, is accuracy holding, and are the same slow transitions disappearing?</p>
        <p>TypeCafe groups results by day so a session with ten attempts does not outweigh a day with one. The daily trend shows whether the practice is transferring, even when you skip days or one run is unusually messy.</p>
        <p><Link href="/progress">See WPM, accuracy, and momentum grouped by tested day →</Link></p>
      </DocumentSection>

      <DocumentSection title="When should you stop worrying about consistency?">
        <p>If your accuracy is high, your sustainable speed is improving, and the graph has no repeated avoidable stalls, do not contort your technique to chase a prettier percentage. Measurements serve the improvement; the improvement does not serve the measurement.</p>
        <p><Link href="/">Take a test and get a diagnosis you can act on →</Link></p>
      </DocumentSection>
    </DocumentPage>
  </>
);

export default ConsistencyGuide;
