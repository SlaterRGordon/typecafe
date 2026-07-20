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
import { MASTERY_CHECK_INTERVALS, SKILL_EVIDENCE_THRESHOLDS } from "~/lib/skillEvidence";
import { CHECK_CARRIER_DENSITY_CAP, DRILL_SAMPLE_QUOTAS } from "~/lib/drill";

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
        updated="July 15, 2026"
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
          <p>Backspace removes that position from the score card&apos;s final speed and accuracy. The original attempt still counts in your per-key evidence, so correcting a miss cleans up the result without hiding the weakness from your coach.</p>
        </DocumentSection>

        <DocumentSection title="Per-Key Heatmap">
          <p>The keyboard heatmap shades each <em>physical</em> key by your accuracy on it. Because there is one physical key per cell, characters that share a key fold together: a capital <code>R</code> counts toward the <code>r</code> key, and shifted symbols count toward their base key (<code>!</code>→<code>1</code>, <code>?</code>→<code>/</code>, <code>:</code>→<code>;</code>). So the <code>r</code> cell reflects every time you reached for that key, shifted or not.</p>
          <p>Untyped keys read as 100% (neutral) rather than alarming red, so the map only lights up where there is real evidence.</p>
        </DocumentSection>

        <DocumentSection title="Net WPM">
          <p>Net WPM is the canonical &quot;WPM&quot; across TypeCafe - the headline number on score cards, the figure leaderboards and personal bests rank by, and what your progress trends and improvement measure. Raw WPM is shown beside it for reference, never as the headline.</p>
          <p><code>((correct keystrokes - incorrect keystrokes) / 5) / elapsed minutes</code></p>
          <p>The value is clamped at 0. A fully wrong run can still have raw speed, but it has 0 net WPM. Each saved test&apos;s sortable score and each current daily rollup store net WPM directly; raw speed and accuracy remain available for explanation and compatibility.</p>
        </DocumentSection>

        <DocumentSection title="Consistency">
          <p>Consistency measures how steady your pace was across the WPM chart samples. TypeCafe computes the coefficient of variation of the sampled WPM values, then converts it to a 0-100 score:</p>
          <p><code>(1 - standard deviation / mean WPM) * 100</code>, clamped to the 0-100 range.</p>
          <p>100 means a perfectly even pace. Lower values mean the run was more bursty, stop-start, or uneven.</p>
        </DocumentSection>

        <DocumentSection title="Progress &amp; Improvement">
          <p>Progress periods use your local calendar. For example, 7d means today plus the previous six local dates, not a trailing 168-hour slice that can touch eight dates.</p>
          <p>The WPM chart gives every practiced day one vote. Each dot is that day&apos;s median net WPM, and the solid line is a straight least-squares trend through those daily medians.</p>
          <p>The progress headline compares the first practiced day in the selected period with the latest practiced day. Skipped dates do not count as zero and do not block a comparison: one practiced day builds the baseline, and the second can show a change.</p>
          <p>The dashed daily best trend is a separate straight fit through each day&apos;s highest ranked net WPM. Hover or focus a daily dot to see its exact median, daily best, test count, average accuracy, and average consistency.</p>
          <p>Daily averages are built by calculating net WPM for each test first, then averaging those net values. TypeCafe does not estimate net speed from separate daily averages.</p>
          <p>Signed-in progress reads each saved test&apos;s canonical net score. Guest history is versioned on the device: new entries store net WPM, while older unversioned raw-WPM entries are converted once from their saved accuracy before they appear in Progress or sync to an account.</p>
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
            <li><strong>Recent, not lifetime:</strong> per-key accuracy and per-pair speed are rolling windows - roughly your last {KEY_ATTEMPT_CAP} attempts on a key and {TRANSITION_SAMPLE_CAP} occurrences of a pair. Older samples fade out proportionally, so the coach reflects how you type <em>now</em>, and a weakness you fix stops being flagged once recent typing proves it.</li>
          </ul>
        </DocumentSection>

        <DocumentSection title="Coach Target Impact">
          <p>The Daily Coach ranks supported weaknesses by estimated time cost, not raw slowness. A common transition that is moderately slow can outrank a rare transition that is much slower because fixing it affects more of your typing.</p>
          <p><code>Impact = (latency cost + correction cost) × confidence × recency weight</code>, reported as approximate milliseconds lost per 1,000 natural characters. Latency cost is the positive gap above your robust personal median multiplied by natural frequency. Error cost is the error rate multiplied by your median correction cost and natural frequency; until personal correction evidence exists, the fallback is {SKILL_EVIDENCE_THRESHOLDS.correctionFallbackLatencyMultiplier} times your robust inter-key median.</p>
          <ul>
            <li><strong>Robust timing:</strong> non-positive gaps are excluded. An interruption is any gap above the smaller of {SKILL_EVIDENCE_THRESHOLDS.interruptionMaxMs.toLocaleString()}ms or the Test median plus {SKILL_EVIDENCE_THRESHOLDS.interruptionMadMultiplier} median absolute deviations; it is flagged as sample quality, never called a weakness.</li>
            <li><strong>Key latency:</strong> at least {SKILL_EVIDENCE_THRESHOLDS.keyLatencyMinSamples} timed arrivals from at least {SKILL_EVIDENCE_THRESHOLDS.keyLatencyMinPredecessors} predecessor keys, at least {SKILL_EVIDENCE_THRESHOLDS.keyLatencyMinRatio}x the personal median, and at least {SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs}ms slower.</li>
            <li><strong>Key accuracy:</strong> at least {SKILL_EVIDENCE_THRESHOLDS.keyAccuracyMinAttempts} attempts across two Tests (or one coverage-shaped diagnostic Test), below {SKILL_EVIDENCE_THRESHOLDS.keyAccuracyFloorPct}%.</li>
            <li><strong>Transition evidence:</strong> at least {SKILL_EVIDENCE_THRESHOLDS.transitionMinSamples} occurrences across {SKILL_EVIDENCE_THRESHOLDS.transitionMinTests} Tests or {SKILL_EVIDENCE_THRESHOLDS.transitionMinWords} distinct words. Latency needs the same {SKILL_EVIDENCE_THRESHOLDS.transitionLatencyMinRatio}x and {SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs}ms floors; accuracy becomes a candidate at a {SKILL_EVIDENCE_THRESHOLDS.transitionErrorRateFloorPct}% error rate.</li>
            <li><strong>Trigrams:</strong> at least {SKILL_EVIDENCE_THRESHOLDS.trigramMinSamples} within-word occurrences across {SKILL_EVIDENCE_THRESHOLDS.trigramMinTests} Tests and {SKILL_EVIDENCE_THRESHOLDS.trigramMinWords} distinct words.</li>
            <li><strong>Tetragrams:</strong> at least {SKILL_EVIDENCE_THRESHOLDS.tetragramMinSamples} within-word occurrences across {SKILL_EVIDENCE_THRESHOLDS.tetragramMinTests} Tests and {SKILL_EVIDENCE_THRESHOLDS.tetragramMinWords} distinct words.</li>
            <li><strong>Recurring words:</strong> at least {SKILL_EVIDENCE_THRESHOLDS.wordMinSamples} occurrences across {SKILL_EVIDENCE_THRESHOLDS.wordMinTests} Tests. Timing counts only the word&apos;s internal arrivals, never the pause before the word.</li>
            <li><strong>Higher-order timing:</strong> Grams and words must be at least {SKILL_EVIDENCE_THRESHOLDS.higherOrderLatencyMinRatio}x the matching personal rhythm and clear the {SKILL_EVIDENCE_THRESHOLDS.latencyNoiseFloorMs}ms noise floor. Gram cost is summed from internal keystroke gaps; TypeCafe does not invent a synthetic Gram WPM.</li>
            <li><strong>Language frequency:</strong> once natural history reaches {SKILL_EVIDENCE_THRESHOLDS.naturalFrequencyMinCharacters.toLocaleString()} characters it supplies occurrence rates directly. Before then, TypeCafe derives a bounded prior from the active language&apos;s bundled common-word list.</li>
            <li><strong>Correction confusion:</strong> the same expected/typed confusion must recur at least {SKILL_EVIDENCE_THRESHOLDS.correctionMinErrors} times across {SKILL_EVIDENCE_THRESHOLDS.correctionMinTests} Tests.</li>
            <li><strong>Movement classes:</strong> TypeCafe classifies the expected layout geometry, not the finger a person actually used. A movement needs at least {SKILL_EVIDENCE_THRESHOLDS.movementMinSamples} occurrences across {SKILL_EVIDENCE_THRESHOLDS.movementMinSequences} concrete key sequences before it can become a Target.</li>
            <li><strong>Endurance:</strong> a short/long gap needs at least {SKILL_EVIDENCE_THRESHOLDS.enduranceMinTestsPerLength} natural Tests at each duration, with language, layout stats pool, Test kind, options, punctuation, capitals, and numbers held fixed. Short Tests are at most {SKILL_EVIDENCE_THRESHOLDS.enduranceShortMaxSeconds}s, long Tests are at least {SKILL_EVIDENCE_THRESHOLDS.enduranceLongMinSeconds}s, and the median gap must reach {SKILL_EVIDENCE_THRESHOLDS.enduranceMinGapWpm} WPM.</li>
            <li><strong>Option costs:</strong> punctuation, capital, and number costs compare at least {SKILL_EVIDENCE_THRESHOLDS.optionCostMinTests} matched natural Tests on each side, changing only that option. Gaps below {SKILL_EVIDENCE_THRESHOLDS.optionCostMinGapWpm} WPM stay hidden.</li>
            <li><strong>Practice and checks:</strong> acquisition text targets at least {DRILL_SAMPLE_QUOTAS.acquisition} supported samples and may saturate the Target. Transfer and Cold checks target at least {DRILL_SAMPLE_QUOTAS.transfer} samples in unseen carrier words while limiting Target carriers to {Math.round(CHECK_CARRIER_DENSITY_CAP * 100)}% of the text. Inaccurate Transition and correction Targets use a no-rush 100% Accuracy goal.</li>
            <li><strong>Mastery and due checks:</strong> focused acquisition alone never proves Mastery. An improved varied-text Transfer becomes due for a Cold check on the next local day. A first held Cold check returns after {MASTERY_CHECK_INTERVALS.afterFirstHeldPracticedDays} practiced days; later held checks return after {MASTERY_CHECK_INTERVALS.afterLaterHeldPracticedDays}. Skipped days do not count, and a missed Cold check re-enters normal Impact ranking.</li>
            <li><strong>Confidence:</strong> rises with sample count and required Test, word, or predecessor diversity, and is capped at 1. Recency follows typed volume rather than wall-clock time, so a vacation does not erase evidence.</li>
            <li><strong>Progress ledger ability:</strong> a Target&apos;s Earlier vs Recent compares its natural evidence older than the newest {SKILL_EVIDENCE_THRESHOLDS.abilityRecentTestWindow} Target-containing Tests against those newest Tests, with at least {SKILL_EVIDENCE_THRESHOLDS.abilitySplitMinSamplesPerHalf} samples on each side. Worth stays measured over the full evidence window.</li>
          </ul>
          <p>Only natural and diagnostic Timelines can discover a weakness. Focused Drill attempts are kept separately as acquisition response: they can show that practice changed, but they cannot invent a natural weakness or prove transfer. A drill run counts toward a Target&apos;s practice only when it was launched for that Target, and a drilled Target reads &quot;awaiting a Test&quot; until a newer natural Test actually contains it.</p>
        </DocumentSection>

        <DocumentSection title="Ranked and Unranked Runs">
          <p>Ranked runs feed leaderboards, personal bests, challenge boards, improvement leagues, and percentile brags. Unranked runs still show a result, but they do not compete.</p>
          <p>Saved speed, accuracy, consistency, and score are replayed on the server from the full keystroke and backspace timeline. The browser does not submit those summary numbers as facts.</p>
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
