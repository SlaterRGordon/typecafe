import type { NextPage } from "next";
import Head from "next/head";

import { DocumentPage, DocumentSection } from "~/components/legal/DocumentPage";
import {
  RANKABLE_MIN_KEYSTROKES,
  RANKABLE_MIN_SECONDS,
  WPM_MIN_RELIABLE_KEYSTROKES,
  WPM_MIN_RELIABLE_SECONDS,
  WPM_MIN_WINDOW_SECONDS,
  WPM_WINDOW_SECONDS,
} from "~/lib/stats";
import { STANCE_THRESHOLDS } from "~/lib/stance";
import { PLATEAU_CONFIG } from "~/lib/trajectory";
import { TRANSITION_MIN_COUNT, TRANSITION_SLOW_RATIO, TRANSITION_SAMPLE_CAP } from "~/lib/transitions";
import { KEY_ATTEMPT_CAP } from "~/lib/practiceAttempts";

const HowWeMeasure: NextPage = () => {
  return (
    <>
      <Head>
        <title>How TypeCafe Measures WPM, Accuracy, and Progress</title>
        <meta
          name="description"
          content="How TypeCafe calculates raw WPM, net WPM, accuracy, consistency, unranked runs, coach thresholds, and progress signals."
        />
      </Head>
      <DocumentPage
        eyebrow="Measurement"
        title="How TypeCafe Measures Typing"
        updated="June 20, 2026"
        intro="TypeCafe is a typing coach, so the numbers have to be boringly honest. This page explains the formulas and thresholds used on score cards, progress charts, coach notes, and ranked surfaces."
      >
        <DocumentSection title="Words Per Minute">
          <p>TypeCafe uses the standard typing-test convention: 1 word = 5 typed characters. Spaces and punctuation count as characters when they are part of the prompt.</p>
          <ul>
            <li><strong>Raw WPM:</strong> <code>(typed characters / 5) / elapsed minutes</code>.</li>
            <li><strong>Timed tests:</strong> elapsed time is the configured test length, even if the last keystroke happened earlier.</li>
            <li><strong>Untimed tests:</strong> elapsed time runs from the first recorded keystroke to the last recorded keystroke.</li>
            <li><strong>Live chart WPM:</strong> the chart reads real keystroke timing over a trailing {WPM_WINDOW_SECONDS}s window, shrinking only as low as {WPM_MIN_WINDOW_SECONDS}s near the start of a test.</li>
          </ul>
          <p>Very tiny samples are hidden instead of exaggerated. A WPM sample must have at least {WPM_MIN_RELIABLE_SECONDS}s of typing and at least {WPM_MIN_RELIABLE_KEYSTROKES} keystrokes before TypeCafe treats it as meaningful.</p>
        </DocumentSection>

        <DocumentSection title="Accuracy">
          <p>Accuracy is keystroke accuracy: <code>correct keystrokes / total typed keystrokes</code>. If you type 100 characters and 92 match the expected text, accuracy is 92%.</p>
          <p>Backspace changes the live character count for speed timing, but it is not a magic eraser for accuracy. The score card reports the correctness of what you typed against the prompt.</p>
        </DocumentSection>

        <DocumentSection title="Per-Key Heatmap">
          <p>The keyboard heatmap shades each <em>physical</em> key by your accuracy on it. Because there is one physical key per cell, characters that share a key fold together: a capital <code>R</code> counts toward the <code>r</code> key, and shifted symbols count toward their base key (<code>!</code>→<code>1</code>, <code>?</code>→<code>/</code>, <code>:</code>→<code>;</code>). So the <code>r</code> cell reflects every time you reached for that key, shifted or not.</p>
          <p>Untyped keys read as 100% (neutral) rather than alarming red, so the map only lights up where there is real evidence.</p>
        </DocumentSection>

        <DocumentSection title="Net WPM">
          <p>Net WPM is the canonical &quot;WPM&quot; across TypeCafe — the headline number on score cards, the figure leaderboards and personal bests rank by, and what your progress trends and improvement measure. Raw WPM is shown beside it for reference, never as the headline.</p>
          <p><code>((correct keystrokes - incorrect keystrokes) / 5) / elapsed minutes</code></p>
          <p>The value is clamped at 0. A fully wrong run can still have raw speed, but it has 0 net WPM. Where only raw WPM and accuracy are stored (older rows, daily rollups), net is derived exactly as <code>raw × (2 × accuracy − 1)</code>.</p>
        </DocumentSection>

        <DocumentSection title="Consistency">
          <p>Consistency measures how steady your pace was across the WPM chart samples. TypeCafe computes the coefficient of variation of the sampled WPM values, then converts it to a 0-100 score:</p>
          <p><code>(1 - standard deviation / mean WPM) * 100</code>, clamped to the 0-100 range.</p>
          <p>100 means a perfectly even pace. Lower values mean the run was more bursty, stop-start, or uneven.</p>
        </DocumentSection>

        <DocumentSection title="Progress &amp; Improvement">
          <p>Progress pages compare your current window against the previous matching window. For example, the 30-day headline compares the last 30 days with the 30 days before that.</p>
          <p>Score cards may show a 30-day improvement after save. That requires at least 3 prior ranked tests in the last 30 days, so the comparison has enough evidence to be useful.</p>
        </DocumentSection>

        <DocumentSection title="Coach Thresholds">
          <p>The coach is heuristic-first: no paid model and no hidden black box. These thresholds live in code and are documented here so they can be tuned honestly.</p>
          <ul>
            <li><strong>Accuracy-limited:</strong> recent accuracy below {STANCE_THRESHOLDS.accuracyFloor}% while WPM is not clearly improving.</li>
            <li><strong>Confidence-limited:</strong> recent accuracy above {STANCE_THRESHOLDS.accuracyCeiling}% with consistency below {STANCE_THRESHOLDS.consistencyFloor}%.</li>
            <li><strong>Stance window:</strong> the last {STANCE_THRESHOLDS.windowDays} days, with at least {STANCE_THRESHOLDS.minTests} tests.</li>
            <li><strong>Flat trend:</strong> a WPM delta within {STANCE_THRESHOLDS.flatDeltaWpm} WPM counts as not clearly moving.</li>
            <li><strong>Plateau:</strong> a 21-day trend whose projected change is inside a {PLATEAU_CONFIG.bandWpm} WPM band, with at least {PLATEAU_CONFIG.minTests} tests.</li>
          </ul>
        </DocumentSection>

        <DocumentSection title="Diagnosis Thresholds">
          <p>Diagnosis only speaks when there is enough evidence. Short tests and one-off slips should not become fake coaching.</p>
          <ul>
            <li><strong>Slow transitions:</strong> a letter pair must appear at least {TRANSITION_MIN_COUNT} times and be at least {TRANSITION_SLOW_RATIO}x slower than your overall transition pace.</li>
            <li><strong>Recent, not lifetime:</strong> per-key accuracy and per-pair speed are rolling windows — roughly your last {KEY_ATTEMPT_CAP} attempts on a key and {TRANSITION_SAMPLE_CAP} occurrences of a pair. Older samples fade out proportionally, so the coach reflects how you type <em>now</em>, and a weakness you fix stops being flagged once recent typing proves it.</li>
          </ul>
        </DocumentSection>

        <DocumentSection title="Ranked and Unranked Runs">
          <p>Ranked runs feed leaderboards, personal bests, challenge boards, improvement leagues, and percentile brags. Unranked runs still show a result, but they do not compete.</p>
          <ul>
            <li>Custom-length tests are unranked.</li>
            <li>Tiny runs are unranked: a ranked test needs at least {RANKABLE_MIN_SECONDS}s of typing and at least {RANKABLE_MIN_KEYSTROKES} keystrokes, so a stray tap never inflates a streak or trend.</li>
            <li>Impossible keystroke timelines are unranked by basic sanity checks.</li>
            <li>Ranked boards query only rows marked ranked.</li>
          </ul>
          <p>The anti-cheat checks are intentionally basic: they catch obvious machine-like timelines, not every possible abuse case. Stronger verification waits until there is a population worth protecting.</p>
        </DocumentSection>
      </DocumentPage>
    </>
  );
};

export default HowWeMeasure;
