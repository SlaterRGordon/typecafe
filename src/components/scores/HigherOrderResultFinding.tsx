import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { ensureLanguageLoaded, getWords } from "~/components/typer/utils";
import { useGuestEvidence } from "~/hooks/useGuestEvidence";
import type { TimelineEvidence } from "~/lib/evidenceNormalization";
import { statsPoolFor } from "~/lib/keyboardLayout";
import type { SkillCandidate } from "~/lib/skillEvidence";
import { baseTypeLanguage } from "~/lib/typeLanguage";
import { api } from "~/utils/api";
import { TestModes } from "~/components/typer/types";
import type { ShareableScore } from "./ShareableScoreCard";

interface HigherOrderResultFindingProps {
  score: ShareableScore;
  boardLayout: string;
  withReMeasure: (href: string) => string;
  onFindingChange: (present: boolean) => void;
}

export function HigherOrderResultFinding({
  score,
  boardLayout,
  withReMeasure,
  onFindingChange,
}: HigherOrderResultFindingProps) {
  const language = baseTypeLanguage(score.language) ?? score.language;
  const pool = statsPoolFor(boardLayout);
  const { data: auth } = useSession();
  const signedIn = !!auth?.user;
  const guestEvidence = useGuestEvidence();
  const remoteTimelines = api.test.getLatestTimelines.useQuery(
    { language, pool },
    { enabled: signedIn, retry: false },
  );
  const [corpusWords, setCorpusWords] = useState<string[] | null>(null);
  const [finding, setFinding] = useState<SkillCandidate | null>(null);

  useEffect(() => {
    let active = true;
    setCorpusWords(null);
    void ensureLanguageLoaded(language).then(() => {
      if (active) setCorpusWords(getWords(language));
    });
    return () => { active = false; };
  }, [language]);

  useEffect(() => {
    let active = true;
    setFinding(null);
    onFindingChange(false);
    if (!score.timeline || !corpusWords || score.mode !== TestModes.normal) {
      return () => { active = false; };
    }
    const histories = signedIn ? remoteTimelines.data ?? [] : guestEvidence?.timelines ?? [];
    const current: TimelineEvidence = {
      completedAt: score.createdAt?.getTime() ?? Date.now(),
      context: "natural",
      mode: score.mode,
      subMode: score.subMode,
      count: score.count,
      options: score.options ?? "",
      punctuation: score.punctuation ?? false,
      capitals: score.capitals ?? false,
      numbers: score.numbers ?? false,
      layout: boardLayout,
      pool,
      language,
      timeline: score.timeline,
    };
    const encodedCurrent = JSON.stringify(current.timeline);
    const timelines = histories.some((timeline) => JSON.stringify(timeline.timeline) === encodedCurrent)
      ? histories
      : [current, ...histories];
    void import("~/lib/skillEvidence").then(({ analyzeTypingEvidence }) => {
      const next = analyzeTypingEvidence({ timelines, corpusWords }).candidates.find((candidate) =>
        candidate.target.kind === "gram" || candidate.target.kind === "word",
      ) ?? null;
      if (!active) return;
      setFinding(next);
      onFindingChange(!!next);
    });
    return () => {
      active = false;
    };
  }, [
    boardLayout,
    corpusWords,
    guestEvidence?.timelines,
    language,
    onFindingChange,
    pool,
    remoteTimelines.data,
    score.capitals,
    score.count,
    score.createdAt,
    score.mode,
    score.numbers,
    score.options,
    score.punctuation,
    score.subMode,
    score.timeline,
    signedIn,
  ]);

  if (!finding) return null;
  const target = finding.target;
  const words = target.kind === "word"
    ? target.words
    : target.kind === "gram" && finding.reason.code === "gram_internal_latency_high"
      ? finding.reason.carrierWords
      : [];
  if (words.length === 0) return null;

  const summary = target.kind === "gram" && finding.reason.code === "gram_internal_latency_high"
    ? <>
        Your <span className="font-mono font-bold">{target.gram}</span> pattern took about {Math.round(finding.reason.excessMs)}ms longer than your normal rhythm across {finding.distinctWords} words.
      </>
    : target.kind === "word" && target.sharedGram
      ? <>
          Across recent natural typing, recurring hard words share <span className="font-mono font-bold">{target.sharedGram}</span>: {words.join(", ")}.
        </>
      : <>Across recent natural typing, a hard word recurred: <span className="font-mono font-bold">{words[0]}</span>.</>;
  const href = `/drill?words=${words.map(encodeURIComponent).join(",")}`;

  return (
    <ul data-testid="diagnosis-higher-order" className="flex flex-col gap-3">
      <li className="flex flex-col gap-3 border-b border-base-content/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-base-content/90">{summary}</span>
        <Link
          className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          href={withReMeasure(href)}
          aria-label={`Drill the ${target.kind === "gram" ? target.gram : "recurring word"} pattern`}
        >
          Drill this pattern
        </Link>
      </li>
    </ul>
  );
}
