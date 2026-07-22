import { type NextPage } from "next"
import Head from "next/head"
import Link from "next/link"
import { useRouter } from "next/router"
import { useSession } from "next-auth/react"
import { useDispatch } from "react-redux"
import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { TargetGlyph } from "~/components/coaching/TargetGlyph"
import { Keyboard } from "~/components/typer/Keyboard"
import { Typer, type TestCompletionResult } from "~/components/typer/Typer"
import { typingFocusFadeClass } from "~/components/typer/typingFocus"
import { TestModes, TestSubModes } from "~/components/typer/types"
import { ensureLanguageLoaded, getWords } from "~/components/typer/utils"
import { useGuestEvidence } from "~/hooks/useGuestEvidence"
import { useCoachingEvidence } from "~/hooks/useCoachingEvidence"
import { useLanguage } from "~/hooks/useLanguage"
import { useLayout } from "~/hooks/useLayout"
import { useCustomGramsPreference } from "~/hooks/useCustomGramsPreference"
import {
    compileCustomGramsPractice,
    completeCustomGramsPractice,
    customGramsPracticeRecord,
    normalizeCustomGram,
    rankCommonGrams,
    type CustomGramsPracticePreferences,
    type CustomGramsPracticeRun,
} from "~/lib/customGramsPractice"
import {
    compileCustomKeysPractice,
    completeCustomKeysPractice,
    customKeysPracticeRecord,
    type CustomKeysPracticePreferences,
    type CustomKeysPracticeRun,
} from "~/lib/customKeysPractice"
import { readCustomKeysPracticePreferences, writeCustomKeysPracticePreferences } from "~/lib/customKeysPreferences"
import { PRACTICE_DURATIONS_SECONDS, PRACTICE_TEXT_STYLES, type PracticeDurationSeconds, type PracticeTextStyle } from "~/lib/evidenceContext"
import { parseCoachingTargetQuery, targetDisplayLabel, targetUsesArrow, targetVisualKeys, type GuidedTargetEvidence, type ParsedCoachingTarget } from "~/lib/coachingTarget"
import {
    compileGuidedPractice,
    completeGuidedPractice,
    focusMatchesPrescription,
    guidedPracticeRecord,
    guidedPracticeSetup,
    measuredGramSuggestions,
    type GuidedPracticeRun,
} from "~/lib/guidedPractice"
import { boardFor, sequenceFor, statsPoolFor } from "~/lib/keyboardLayout"
import { initialPracticeKeys, nextStickyPracticeLayer, type StickyPracticeLayer } from "~/lib/practiceKeyboard"
import { projectNaturalKeyboardEvidence, type NaturalKeyboardEvidence } from "~/lib/skillEvidence"
import { keySpeedBars } from "~/lib/transitions"
import { languageMeta, supportsCustomPractice } from "~/lib/languageMeta"
import { parsePracticePath, readPracticePath, resolvePracticeEntry, writePracticePath, type PracticePath } from "~/lib/practiceEntry"
import { practiceWordCapacity } from "~/lib/practiceCapacity"
import { addAlert } from "~/state/alert/alertSlice"
import { api } from "~/utils/api"

type CompletedRun =
    | { path: "keys", result: TestCompletionResult, run: CustomKeysPracticeRun }
    | { path: "grams", result: TestCompletionResult, run: CustomGramsPracticeRun }
    | { path: "guided", result: TestCompletionResult, run: GuidedPracticeRun, evidence: GuidedTargetEvidence | null }

type GramSource = "measured" | "recent" | "common"

function signed(value: number): string {
    return `${value >= 0 ? "+" : ""}${Math.round(value)}`
}

const Practice: NextPage = () => {
    const router = useRouter()
    const dispatch = useDispatch()
    const { data: session } = useSession()
    const signedIn = !!session?.user
    const [language] = useLanguage()
    const [layout] = useLayout()
    const pool = statsPoolFor(layout)
    const guestEvidence = useGuestEvidence()
    const coaching = useCoachingEvidence()
    const [path, setPath] = useState<PracticePath>("keys")
    const [guided, setGuided] = useState<ParsedCoachingTarget | null>(null)
    const [keysPreferences, setKeysPreferences] = useState<CustomKeysPracticePreferences>({ keys: [], durationSeconds: 60, textStyle: "varied" })
    const [gramsPreferences, setGramsPreferences] = useState<CustomGramsPracticePreferences>({ grams: [], durationSeconds: 60, textStyle: "varied" })
    const [gramEntry, setGramEntry] = useState("")
    const [gramEntryError, setGramEntryError] = useState<string | null>(null)
    const [gramSource, setGramSource] = useState<GramSource>("measured")
    const customGramsPreference = useCustomGramsPreference(language, signedIn)
    const customGramsSetupScope = customGramsPreference.scope
    const appliedCustomGramsSetup = useRef<string | null>(null)
    const [ready, setReady] = useState(false)
    const [keysInitialized, setKeysInitialized] = useState(false)
    const [corpus, setCorpus] = useState<string[]>([])
    const [seed, setSeed] = useState(1)
    const [running, setRunning] = useState(false)
    const [restartSignal, setRestartSignal] = useState(0)
    const [completed, setCompleted] = useState<CompletedRun | null>(null)
    const [stickyLayer, setStickyLayer] = useState<StickyPracticeLayer>("base")
    const charAttemptsRef = useRef(new Map<string, { attempts: number, correct: number }>())
    const keysEditorRef = useRef<HTMLElement>(null)
    const gramsEditorRef = useRef<HTMLElement>(null)
    const gramInputRef = useRef<HTMLInputElement>(null)
    const explainedInvalidTarget = useRef<string | null>(null)
    const board = useMemo(() => boardFor(layout), [layout])
    const hasAltGr = board.rows.some((row) => row.some((key) => key.altgr !== undefined))
    const activePreferences = path === "keys" ? keysPreferences : gramsPreferences
    const requestedCustomPath = parsePracticePath(router.query.custom)
    const hasTargetIntent = router.query.target !== undefined

    useEffect(() => {
        if (!router.isReady) return
        const parsed = parseCoachingTargetQuery(router.query)
        const setup = parsed ? guidedPracticeSetup(parsed.target) : null
        const savedKeys = readCustomKeysPracticePreferences()
        const entry = resolvePracticeEntry({
            explicitPath: requestedCustomPath,
            guidedPath: parsed && setup ? setup.focus.kind : null,
            rememberedPath: readPracticePath(),
            hasTargetIntent,
        })
        if (entry.rememberPath) writePracticePath(entry.path)
        if (entry.kind === "guided" && parsed && setup) {
            setGuided(parsed)
            setPath(entry.path)
            if (setup.focus.kind === "keys") setKeysPreferences({ keys: setup.focus.items, durationSeconds: setup.durationSeconds, textStyle: setup.textStyle })
            else setGramsPreferences({ grams: setup.focus.items, durationSeconds: setup.durationSeconds, textStyle: setup.textStyle })
            setKeysInitialized(true)
        } else {
            setGuided(null)
            setPath(entry.path)
            setKeysPreferences(savedKeys)
            setKeysInitialized(false)
        }
        if (entry.invalidTarget && explainedInvalidTarget.current !== router.asPath) {
            explainedInvalidTarget.current = router.asPath
            dispatch(addAlert({ message: `That Guided Target is no longer available. Resuming Custom ${entry.path === "keys" ? "Keys" : "Grams"}.`, type: "warning" }))
        } else if (!entry.invalidTarget) {
            explainedInvalidTarget.current = null
        }
        setSeed(Date.now())
        setReady(true)
    }, [dispatch, hasTargetIntent, requestedCustomPath, router.asPath, router.isReady, router.query])

    useEffect(() => {
        if (!ready) return
        setKeysPreferences((current) => {
            const keys = current.keys.filter((key) => sequenceFor(key, layout).length > 0).slice(0, 8)
            return keys.join("\0") === current.keys.join("\0") ? current : { ...current, keys }
        })
    }, [keysInitialized, layout, ready])

    useEffect(() => {
        let active = true
        void ensureLanguageLoaded(language).then(() => {
            const words = getWords(language).map((word) => word.normalize("NFC"))
            if (active) setCorpus(words)
        })
        return () => { active = false }
    }, [language])

    useEffect(() => {
        if (ready && keysInitialized && !guided) writeCustomKeysPracticePreferences(keysPreferences)
    }, [guided, keysInitialized, keysPreferences, ready])

    useEffect(() => {
        if (!ready || guided || !customGramsPreference.loaded || appliedCustomGramsSetup.current === customGramsSetupScope) return
        appliedCustomGramsSetup.current = customGramsSetupScope
        setGramsPreferences(customGramsPreference.setup ?? { grams: [], durationSeconds: 60, textStyle: "varied" })
    }, [customGramsPreference.loaded, customGramsPreference.setup, customGramsSetupScope, guided, ready])

    const timelines = api.test.getLatestTimelines.useQuery(
        { language, pool },
        { enabled: signedIn, retry: false },
    )
    const history = useMemo<CustomKeysPracticeRun[]>(() => {
        const evidence = signedIn ? timelines.data ?? [] : guestEvidence?.timelines ?? []
        return evidence.flatMap((item, index): CustomKeysPracticeRun[] => item.practice ? [{
            id: `history-${item.completedAt}-${index}`,
            completedAt: item.completedAt,
            practice: item.practice,
            timeline: item.timeline,
        }] : [])
    }, [guestEvidence?.timelines, signedIn, timelines.data])

    const typeableCorpus = useMemo(() => corpus.filter((word) => [...word]
        .every((character) => sequenceFor(character.toLowerCase(), layout).length > 0)), [corpus, layout])
    const commonGrams = useMemo(() => path === "grams" ? rankCommonGrams(corpus, 5)
        .filter(({ gram }) => [...gram].every((character) => sequenceFor(character, layout).length > 0)) : [], [corpus, layout, path])
    const measuredGrams = useMemo(() => measuredGramSuggestions(coaching.analysis?.candidates ?? []), [coaching.analysis?.candidates])
    useEffect(() => {
        if (path !== "grams" || coaching.loading || !customGramsPreference.loaded) return
        const hasRecent = customGramsPreference.entries.length > 0
        const activeSourceHasOptions = gramSource === "measured" ? measuredGrams.length > 0
            : gramSource === "recent" ? hasRecent
            : commonGrams.length > 0
        if (activeSourceHasOptions) return
        const fallback = measuredGrams.length > 0 ? "measured" : hasRecent ? "recent" : commonGrams.length > 0 ? "common" : null
        if (fallback) setGramSource(fallback)
    }, [coaching.loading, commonGrams.length, customGramsPreference.entries.length, customGramsPreference.loaded, gramSource, measuredGrams.length, path])
    const projectedNaturalKeyboard = useMemo(
        () => projectNaturalKeyboardEvidence(coaching.evidence?.timelines ?? []),
        [coaching.evidence?.timelines],
    )
    useEffect(() => {
        if (!ready || guided || keysInitialized || coaching.loading) return
        setKeysPreferences((current) => ({
            ...current,
            keys: initialPracticeKeys(
                current.keys,
                coaching.analysis?.candidates ?? [],
                projectedNaturalKeyboard.attempts,
                layout,
            ),
        }))
        setKeysInitialized(true)
    }, [coaching.analysis?.candidates, coaching.loading, guided, keysInitialized, layout, projectedNaturalKeyboard.attempts, ready])
    const keyboardEvidenceScope = `${coaching.scope}\0${language}\0${pool}`
    const [naturalKeyboardSnapshot, setNaturalKeyboardSnapshot] = useState<{
        scope: string
        evidence: NaturalKeyboardEvidence
    } | null>(null)
    useEffect(() => {
        if (coaching.loading) return
        setNaturalKeyboardSnapshot((current) => current?.scope === keyboardEvidenceScope
            ? current
            : { scope: keyboardEvidenceScope, evidence: projectedNaturalKeyboard })
    }, [coaching.loading, keyboardEvidenceScope, projectedNaturalKeyboard])
    const naturalKeyboard = naturalKeyboardSnapshot?.scope === keyboardEvidenceScope
        ? naturalKeyboardSnapshot.evidence
        : null
    const naturalSpeedBars = useMemo(() => keySpeedBars(naturalKeyboard?.transitions ?? []), [naturalKeyboard?.transitions])
    const activeFocus = useMemo(() => path === "keys"
        ? { kind: "keys" as const, items: keysPreferences.keys }
        : { kind: "grams" as const, items: gramsPreferences.grams }, [gramsPreferences.grams, keysPreferences.keys, path])
    useEffect(() => {
        if (guided && !focusMatchesPrescription(activeFocus, guided.target)) setGuided(null)
    }, [activeFocus, guided])
    const activeGuidedSetup = useMemo(() => {
        if (!guided || !focusMatchesPrescription(activeFocus, guided.target)) return null
        const setup = guidedPracticeSetup(guided.target)
        if (!setup) return null
        return {
            ...setup,
            focus: activeFocus,
            durationSeconds: activePreferences.durationSeconds,
            textStyle: activePreferences.textStyle,
        }
    }, [activeFocus, activePreferences.durationSeconds, activePreferences.textStyle, guided])
    const completionContextRef = useRef({ activeGuidedSetup, guided, gramsPreferences, keysPreferences, path })
    completionContextRef.current = { activeGuidedSetup, guided, gramsPreferences, keysPreferences, path }
    const compilationConfiguration = useMemo(() => ({
        activeGuidedSetup,
        gramsPreferences,
        keysPreferences,
        language,
        path,
        typeableCorpus,
    }), [activeGuidedSetup, gramsPreferences, keysPreferences, language, path, typeableCorpus])
    const deferredCompilationConfiguration = useDeferredValue(compilationConfiguration)
    const promptPending = deferredCompilationConfiguration !== compilationConfiguration
    const prompt = useMemo(() => deferredCompilationConfiguration.activeGuidedSetup ? compileGuidedPractice({
        setup: deferredCompilationConfiguration.activeGuidedSetup,
        corpus: deferredCompilationConfiguration.typeableCorpus,
        language: deferredCompilationConfiguration.language,
        seed,
        wordCount: practiceWordCapacity(deferredCompilationConfiguration.activeGuidedSetup.durationSeconds),
    }) : deferredCompilationConfiguration.path === "keys" ? compileCustomKeysPractice({
        keys: deferredCompilationConfiguration.keysPreferences.keys,
        corpus: deferredCompilationConfiguration.typeableCorpus,
        language: deferredCompilationConfiguration.language,
        textStyle: deferredCompilationConfiguration.keysPreferences.textStyle,
        seed,
        wordCount: practiceWordCapacity(deferredCompilationConfiguration.keysPreferences.durationSeconds),
    }) : compileCustomGramsPractice({
        grams: deferredCompilationConfiguration.gramsPreferences.grams,
        corpus: deferredCompilationConfiguration.typeableCorpus,
        language: deferredCompilationConfiguration.language,
        textStyle: deferredCompilationConfiguration.gramsPreferences.textStyle,
        seed,
        wordCount: practiceWordCapacity(deferredCompilationConfiguration.gramsPreferences.durationSeconds),
    }), [deferredCompilationConfiguration, seed])
    const baseRecord = useMemo(() => activeGuidedSetup
        ? guidedPracticeRecord(activeGuidedSetup, 0, false)
        : path === "keys"
        ? customKeysPracticeRecord(keysPreferences, 0, false)
        : customGramsPracticeRecord(gramsPreferences, 0, false), [activeGuidedSetup, gramsPreferences, keysPreferences, path])

    const keyRecap = useMemo(() => completed?.path === "keys" ? completeCustomKeysPractice({
        current: completed.run,
        history,
    }) : null, [completed, history])
    const gramRecap = useMemo(() => completed?.path === "grams" ? completeCustomGramsPractice({
        current: completed.run,
        history: history as CustomGramsPracticeRun[],
    }) : null, [completed, history])
    const guidedRecap = useMemo(() => completed?.path === "guided" ? completeGuidedPractice({
        current: completed.run,
        history: history as GuidedPracticeRun[],
        naturalReference: completed.evidence,
    }) : null, [completed, history])

    const refreshPrompt = () => {
        setCompleted(null)
        startTransition(() => setSeed((value) => value + 1))
    }
    const suspendCurrentPrompt = () => {
        const input = document.getElementById("input") as HTMLInputElement | null
        input?.blur()
        if (input) input.disabled = true
    }
    const convertGuidedToCustom = () => {
        if (!guided) return
        setGuided(null)
        dispatch(addAlert({ message: "Changed to Custom Practice", type: "success" }))
    }
    const selectPath = (next: PracticePath) => {
        if (running) return
        writePracticePath(next)
        if (path === next) return
        suspendCurrentPrompt()
        convertGuidedToCustom()
        setPath(next)
        setGramEntryError(null)
        refreshPrompt()
    }
    const updateKeys = (patch: Partial<CustomKeysPracticePreferences>) => {
        if (running) return
        suspendCurrentPrompt()
        const next = { ...completionContextRef.current.keysPreferences, ...patch }
        completionContextRef.current = { ...completionContextRef.current, keysPreferences: next }
        setKeysPreferences(next)
        refreshPrompt()
    }
    const updateGrams = (patch: Partial<CustomGramsPracticePreferences>) => {
        if (running) return
        suspendCurrentPrompt()
        const next = { ...completionContextRef.current.gramsPreferences, ...patch }
        completionContextRef.current = { ...completionContextRef.current, gramsPreferences: next }
        setGramsPreferences(next)
        if (!guided || patch.grams !== undefined) {
            appliedCustomGramsSetup.current = customGramsSetupScope
            customGramsPreference.saveSetup(next)
        }
        refreshPrompt()
    }
    const updateActive = (patch: { durationSeconds?: PracticeDurationSeconds, textStyle?: PracticeTextStyle }) => {
        if (path === "keys") updateKeys(patch)
        else updateGrams(patch)
    }
    const setKeys = (keys: string[]) => {
        const unique = [...new Set(keys.map((key) => key.normalize("NFC")))]
            .filter((key) => sequenceFor(key, layout).length > 0).slice(0, 8)
        completionContextRef.current = {
            ...completionContextRef.current,
            activeGuidedSetup: null,
            guided: null,
            keysPreferences: { ...keysPreferences, keys: unique },
        }
        convertGuidedToCustom()
        updateKeys({ keys: unique })
    }
    const setGrams = (grams: string[]) => {
        const unique = [...new Set(grams)].slice(0, 24)
        completionContextRef.current = {
            ...completionContextRef.current,
            activeGuidedSetup: null,
            guided: null,
            gramsPreferences: { ...gramsPreferences, grams: unique },
        }
        convertGuidedToCustom()
        updateGrams({ grams: unique })
    }
    const toggleGram = (gram: string) => {
        setGrams(gramsPreferences.grams.includes(gram)
            ? gramsPreferences.grams.filter((item) => item !== gram)
            : [...gramsPreferences.grams, gram])
    }
    const addGram = (raw: string) => {
        const gram = normalizeCustomGram(raw)
        if (!gram) {
            setGramEntryError("Enter 2 to 4 letters with no spaces.")
            return
        }
        if (![...gram].every((character) => sequenceFor(character, layout).length > 0)) {
            setGramEntryError("That Gram is not available on your current keyboard layout.")
            return
        }
        customGramsPreference.recordDirect(gram)
        if (!gramsPreferences.grams.includes(gram)) setGrams([...gramsPreferences.grams, gram])
        setGramEntry("")
        setGramEntryError(null)
    }
    const repeat = () => {
        setCompleted(null)
        charAttemptsRef.current = new Map()
        setSeed((value) => value + 1)
        setRestartSignal((value) => value + 1)
    }
    const onComplete = (result: TestCompletionResult) => {
        const completedAt = Date.now()
        const context = completionContextRef.current
        setRunning(false)
        if (context.activeGuidedSetup) {
            setCompleted({
                path: "guided",
                result,
                evidence: context.guided?.evidence ?? null,
                run: {
                    id: `current-${completedAt}`,
                    completedAt,
                    practice: guidedPracticeRecord(context.activeGuidedSetup, context.activeGuidedSetup.durationSeconds * 1_000, true),
                    timeline: result.timeline,
                },
            })
        } else if (context.path === "keys") {
            setCompleted({
                path: context.path,
                result,
                run: {
                    id: `current-${completedAt}`,
                    completedAt,
                    practice: customKeysPracticeRecord(context.keysPreferences, context.keysPreferences.durationSeconds * 1_000, true),
                    timeline: result.timeline,
                },
            })
        } else {
            setCompleted({
                path: context.path,
                result,
                run: {
                    id: `current-${completedAt}`,
                    completedAt,
                    practice: customGramsPracticeRecord(context.gramsPreferences, context.gramsPreferences.durationSeconds * 1_000, true),
                    timeline: result.timeline,
                },
            })
        }
    }

    const hasFocus = path === "keys" ? keysPreferences.keys.length > 0 : gramsPreferences.grams.length > 0
    const focusItems = path === "keys" ? keysPreferences.keys : gramsPreferences.grams
    const focusPreview = focusItems.slice(0, 3)
    const focusOverflow = Math.max(0, focusItems.length - focusPreview.length)
    const focusEditor = () => {
        if (path === "keys") keysEditorRef.current?.focus()
        else if (running) gramsEditorRef.current?.focus()
        else gramInputRef.current?.focus()
    }
    const customGramsSetupReady = customGramsPreference.loaded && appliedCustomGramsSetup.current === customGramsSetupScope

    if (!ready) return (
        <div data-testid="custom-practice-workspace" className="h-full w-full overflow-y-auto bg-base-100 px-3 py-6 sm:px-6 md:py-10">
            <Head><title>Practice | TypeCafe</title></Head>
            <main data-testid="practice-entry-loading" className="mx-auto flex min-h-[20rem] w-full max-w-5xl items-center justify-center md:px-4">
                <span className="loading loading-spinner loading-md text-primary" aria-label="Loading Practice" />
            </main>
        </div>
    )

    if (!supportsCustomPractice(language)) {
        const label = language === "chinese" ? "Chinese" : language === "hindi" ? "Hindi" : "this language"
        return (
            <div data-testid="practice-language-unavailable" className="h-full w-full overflow-y-auto bg-base-100 px-4 py-10">
                <Head><title>Practice unavailable | TypeCafe</title></Head>
                <main className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center">
                    <h1 className="text-2xl font-bold">Custom Practice isn’t available in {label}</h1>
                    <p className="mt-3 text-base-content/65">TypeCafe won’t substitute English material. Choose a supported language from the language menu to practise with truthful text.</p>
                    <div className="mt-6"><Link href="/" className="btn btn-primary">Back to Tests</Link></div>
                </main>
            </div>
        )
    }

    if (!guided && (path === "grams" || requestedCustomPath === "grams") && !customGramsSetupReady) return (
        <div data-testid="custom-practice-workspace" className="h-full w-full overflow-y-auto bg-base-100 px-3 py-6 sm:px-6 md:py-10">
            <Head><title>Practice | TypeCafe</title></Head>
            <main data-testid="custom-grams-setup-loading" className="mx-auto flex min-h-[20rem] w-full max-w-5xl items-center justify-center md:px-4">
                <p className="font-mono text-sm text-base-content/55">Loading saved Gramsâ€¦</p>
            </main>
        </div>
    )

    return (
        <div data-testid="custom-practice-workspace" data-practice-kind={guided ? "guided" : "custom"} className="h-full w-full overflow-y-auto bg-base-100 px-3 py-6 sm:px-6 md:py-10">
            <Head><title>{guided ? "Guided" : "Custom"} Practice | TypeCafe</title></Head>
            <div className="relative mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center gap-5">
                <header data-testid="practice-workspace-identity" className={typingFocusFadeClass(running, "absolute left-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3")}>
                    <div className="min-w-0">
                        {guided ? (
                            <h1 aria-label={`Practise ${targetDisplayLabel(guided.target)}`} className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                                <TargetGlyph
                                    keys={targetVisualKeys(guided.target)}
                                    label={targetDisplayLabel(guided.target)}
                                    arrows={targetUsesArrow(guided.target)}
                                />
                            </h1>
                        ) : <h1 className="sr-only">{path === "keys" ? "Custom Keys Practice" : "Custom Grams Practice"}</h1>}
                    </div>
                </header>

                <section data-testid="practice-workspace-configuration" aria-label="Practice controls" className={typingFocusFadeClass(running, "relative z-20 flex shrink-0 flex-col items-center gap-2.5 py-1")}>
                    <div className="flex items-center gap-4" role="group" aria-label="Custom practice type">
                        <button type="button" disabled={running} aria-pressed={path === "keys"} onClick={() => selectPath("keys")} className={`cursor-pointer text-md transition-colors disabled:cursor-default disabled:opacity-50 ${path === "keys" ? "font-semibold text-primary" : "text-base-content/50 hover:text-base-content"}`}>keys</button>
                        <button type="button" disabled={running} aria-pressed={path === "grams"} onClick={() => selectPath("grams")} className={`cursor-pointer text-md transition-colors disabled:cursor-default disabled:opacity-50 ${path === "grams" ? "font-semibold text-primary" : "text-base-content/50 hover:text-base-content"}`}>grams</button>
                    </div>
                    <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-2">
                        <button
                            type="button"
                            data-testid="practice-focus-summary"
                            onClick={focusEditor}
                            className="flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 overflow-x-hidden whitespace-nowrap text-sm text-base-content/55 transition-colors hover:text-base-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                            aria-label={`Edit ${path === "keys" ? "key" : "Gram"} focus: ${focusItems.join(", ") || "none selected"}`}
                        >
                            <span className="shrink-0">Focus</span>
                            {focusPreview.length > 0 ? focusPreview.map((item) => path === "keys"
                                ? <kbd key={item} className="kbd kbd-xs shrink-0 border-primary/30 bg-primary/15 font-mono text-primary">{item}</kbd>
                                : <span key={item} className="shrink-0 rounded border border-primary/30 bg-primary/15 px-1.5 py-0.5 font-mono text-xs font-semibold text-primary">{item}</span>)
                                : <span className="shrink-0 text-warning">none</span>}
                            {focusOverflow > 0 && <span className="shrink-0 font-mono text-xs font-semibold text-primary">+{focusOverflow}</span>}
                        </button>
                        <span aria-hidden="true" className="text-base-content/20">|</span>
                        <div className="flex items-center gap-3" role="group" aria-label="Duration">
                            {PRACTICE_DURATIONS_SECONDS.map((duration) => <button key={duration} type="button" disabled={running} onClick={() => updateActive({ durationSeconds: duration as PracticeDurationSeconds })} className={`cursor-pointer text-md transition-colors disabled:cursor-default disabled:opacity-50 ${activePreferences.durationSeconds === duration ? "font-semibold text-primary" : "text-base-content/50 hover:text-base-content"}`}>{duration}s</button>)}
                        </div>
                        <span aria-hidden="true" className="text-base-content/20">|</span>
                        <div className="flex items-center gap-3" role="group" aria-label="Text style">
                            {PRACTICE_TEXT_STYLES.map((style) => <button key={style} type="button" disabled={running} onClick={() => updateActive({ textStyle: style as PracticeTextStyle })} className={`cursor-pointer text-md transition-colors disabled:cursor-default disabled:opacity-50 ${activePreferences.textStyle === style ? "font-semibold text-primary" : "text-base-content/50 hover:text-base-content"}`}>{style}</button>)}
                        </div>
                    </div>
                </section>

                <section aria-label="Practice run" data-prompt-ready={promptPending ? "false" : "true"} className="flex w-full shrink-0 items-center py-2">
                    {completed?.path === "guided" && guidedRecap ? (
                        <div data-testid="practice-recap" className="w-full px-2 py-5 sm:px-4">
                            <h2 className="text-2xl font-bold">{guidedRecap.targetLabel}</h2>
                            <p data-testid="guided-awaiting-test" className="mt-1 text-sm font-semibold text-success">practised · awaiting Test</p>
                            {guidedRecap.metric ? (
                                <div className="mt-5 grid gap-3 border-y border-base-content/10 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" data-testid="guided-target-metric">
                                    {guidedRecap.practiceDelta !== null && <p className="text-sm sm:col-span-2"><strong>Practice Delta:</strong> <span className={guidedRecap.practiceDelta >= 0 ? "text-success" : "text-warning"}>{signed(guidedRecap.practiceDelta)}{guidedRecap.metric.unit === "ms" ? " ms faster" : guidedRecap.metric.unit === "%" ? " pts" : " WPM"}</span></p>}
                                    <div className="flex flex-wrap items-end gap-3">
                                        <div><p className="text-xs font-semibold uppercase text-base-content/50">{guidedRecap.metric.label}</p><p className="mt-1 font-mono text-3xl font-bold">{guidedRecap.metric.unit === "ms" ? `${Math.round(guidedRecap.metric.value)} ms` : `${guidedRecap.metric.value.toFixed(1)}${guidedRecap.metric.unit === "%" ? "%" : " WPM"}`}</p></div>
                                    </div>
                                    <p className="font-mono text-xs text-base-content/55">{guidedRecap.metric.attempts} Target attempt{guidedRecap.metric.attempts === 1 ? "" : "s"}</p>
                                    {guidedRecap.practiceDelta === null && <p className="text-sm sm:col-span-2"><strong>Practice Delta:</strong> Building your Guided baseline.</p>}
                                </div>
                            ) : <p className="mt-4 text-sm text-base-content/60">No complete Target attempt landed in this run.</p>}
                            {guidedRecap.naturalReference && <div data-testid="guided-natural-reference" className="mt-3 border-l-2 border-base-content/15 pl-3 text-sm text-base-content/60"><strong className="text-base-content/75">Recent natural-Test reference</strong><br />{guidedRecap.naturalReference.reason}</div>}
                            <div className="mt-5 flex flex-col gap-2 border-t border-base-content/10 pt-4 sm:flex-row">
                                <Link href="/" className="btn btn-sm btn-primary">Take a Test</Link>
                                <button type="button" className="btn btn-sm btn-ghost border-base-content/15" onClick={repeat}>Practise again</button>
                            </div>
                        </div>
                    ) : completed && (keyRecap || gramRecap) ? (
                        <div data-testid="practice-recap" className="w-full px-2 py-5 sm:px-4">
                            <h2 className="text-2xl font-bold">Your focus response</h2>
                            {!(keyRecap?.baselineReady || gramRecap?.baselineReady) && <p className="mt-2 text-sm text-base-content/60">Building your practice baseline.</p>}
                            <div className="mt-5 divide-y divide-base-content/10 border-y border-base-content/10">
                                {keyRecap?.keys.map((row) => (
                                    <div key={row.key} className="py-3" data-testid={`practice-key-${row.key}`}>
                                        <div className="flex items-center justify-between gap-3"><kbd className="kbd font-mono text-primary">{row.key}</kbd><span className="font-mono text-xs text-base-content/55">{row.attempts} attempt{row.attempts === 1 ? "" : "s"}</span></div>
                                        {row.delta && <p className="mt-1 text-xs text-base-content/60">Practice delta: <span className={row.delta.accuracyPoints >= 0 ? "text-success" : "text-warning"}>{signed(row.delta.accuracyPoints)} Accuracy pts</span>{row.delta.speedWpm !== null && <> · <span className={row.delta.speedWpm >= 0 ? "text-success" : "text-warning"}>{signed(row.delta.speedWpm)} response WPM</span></>}</p>}
                                        <p className="mt-2 text-sm"><strong>{row.accuracy.toFixed(1)}%</strong> Accuracy{row.speedWpm !== null && <> · <strong>{Math.round(row.speedWpm)}</strong> response WPM</>}</p>
                                    </div>
                                ))}
                                {gramRecap?.grams.map((row) => (
                                    <div key={row.gram} className="py-3" data-testid={`practice-gram-${row.gram}`}>
                                        <div className="flex items-center justify-between gap-3"><span className="font-mono font-bold text-primary">{row.gram}</span><span className="font-mono text-xs text-base-content/55">{row.attempts} attempt{row.attempts === 1 ? "" : "s"}</span></div>
                                        {row.delta && <p className="mt-1 text-xs text-base-content/60">Practice delta: <span className={row.delta.accuracyPoints >= 0 ? "text-success" : "text-warning"}>{signed(row.delta.accuracyPoints)} Accuracy pts</span>{row.delta.latencyMs !== null && <> · <span className={row.delta.latencyMs >= 0 ? "text-success" : "text-warning"}>{signed(row.delta.latencyMs)}ms faster</span></>}</p>}
                                        <p className="mt-2 text-sm"><strong>{row.accuracy.toFixed(1)}%</strong> Accuracy{row.latencyMs !== null && <> · <strong>{Math.round(row.latencyMs)}ms</strong> arrival</>}{row.speedWpm !== null && <> · <strong>{Math.round(row.speedWpm)}</strong> response WPM</>}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-5 flex justify-end">
                                <button type="button" className="btn btn-sm btn-primary" onClick={repeat}>Repeat with fresh text</button>
                            </div>
                        </div>
                    ) : prompt && hasFocus ? (
                        <Typer
                            language={language}
                            mode={TestModes.practice}
                            subMode={TestSubModes.timed}
                            count={activePreferences.durationSeconds}
                            customLength
                            evidenceContext={guided ? "acquisition" : "custom-practice"}
                            practiceRecord={baseRecord}
                            drillTarget={guided?.target}
                            fixedText={prompt}
                            onTestComplete={onComplete}
                            onTypingFocusChange={setRunning}
                            onRestart={() => setRunning(false)}
                            onRunRestart={() => setSeed((value) => value + 1)}
                            restartSignal={restartSignal}
                            showStats
                            modalOpen={false}
                            charAttemptsRef={charAttemptsRef}
                        />
                    ) : <p className="mx-auto text-sm text-base-content/55">{path === "keys" ? "Choose a key on the keyboard" : "Add a Gram"} to prepare a run.</p>}
                </section>

                {path === "keys" ? (
                    <section ref={keysEditorRef} tabIndex={-1} aria-label="Focus key editor" className={typingFocusFadeClass(running, "relative z-10 rounded-2xl border border-base-content/10 bg-base-200/25 pb-2 outline-none focus-visible:border-primary/50")}>
                        <Keyboard
                            mode={TestModes.practice}
                            selectedKeys={keysPreferences.keys}
                            setSelectedKeys={setKeys}
                            charAttemptsRef={charAttemptsRef}
                            evidenceAttempts={naturalKeyboard?.attempts ?? {}}
                            speedBars={naturalSpeedBars}
                            shiftToggle={stickyLayer === "shift"}
                            altgrToggle={stickyLayer === "altgr"}
                            hasAltGr={hasAltGr}
                            onToggleShift={() => setStickyLayer((current) => nextStickyPracticeLayer(current, "shift"))}
                            onToggleAltgr={() => setStickyLayer((current) => nextStickyPracticeLayer(current, "altgr"))}
                            punctuation
                            numbers
                        />
                    </section>
                ) : (
                    <section ref={gramsEditorRef} tabIndex={-1} aria-label="Gram editor" className={typingFocusFadeClass(running, "relative z-10 rounded-2xl border border-base-content/10 bg-base-200/25 p-3 outline-none focus-visible:border-primary/50 sm:p-4")}>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <span className="text-sm font-medium text-base-content/65">Selected <span aria-hidden="true">·</span> {gramsPreferences.grams.length}</span>
                            <div data-testid="selected-practice-grams" className="flex min-h-8 flex-wrap gap-1.5">
                                {gramsPreferences.grams.map((gram) => (
                                    <button key={gram} type="button" disabled={running} onClick={() => setGrams(gramsPreferences.grams.filter((item) => item !== gram))} className="btn btn-xs h-8 border-primary/30 bg-primary/15 font-mono text-primary hover:border-primary/50 hover:bg-primary/20" aria-label={`Remove ${gram}`}>
                                        {gram}<span aria-hidden="true" className="opacity-50">×</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <form className="mt-3 flex max-w-3xl gap-2" onSubmit={(event) => { event.preventDefault(); addGram(gramEntry) }}>
                            <input ref={gramInputRef} data-testid="custom-gram-input" disabled={running} value={gramEntry} onChange={(event) => { setGramEntry(event.target.value); setGramEntryError(null) }} className="input input-bordered input-sm min-w-0 flex-1 font-mono" aria-label="Custom Gram" placeholder="Add 2–4 letters" autoComplete="off" />
                            <button type="submit" disabled={running} className="btn btn-sm btn-primary">Add</button>
                        </form>
                        {gramEntryError && <p role="alert" className="mt-2 text-xs text-warning">{gramEntryError}</p>}

                        <div className="mt-4 border-t border-base-content/10 pt-3">
                            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                                <div role="tablist" aria-label="Gram sources" className="flex max-w-full gap-5 overflow-x-auto sm:gap-7">
                                    {([
                                        ["measured", "From your Tests", measuredGrams.length === 0],
                                        ["recent", "Recent", customGramsPreference.entries.length === 0],
                                        ["common", `Common in ${languageMeta(language).label}`, commonGrams.length === 0],
                                    ] as const).map(([source, label, disabled]) => (
                                        <button key={source} type="button" role="tab" disabled={running || disabled} aria-selected={gramSource === source} aria-controls={`gram-source-${source}`} onClick={() => setGramSource(source)} className={`shrink-0 border-b-2 px-0.5 pb-2 text-xs font-semibold transition-colors ${gramSource === source ? "border-primary text-base-content" : "border-transparent text-base-content/55 hover:text-base-content/75"} disabled:cursor-default disabled:opacity-35`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                {gramSource === "measured" && <p className="pb-2 text-xs text-base-content/45">extra pause in recent Tests</p>}
                            </div>

                            {gramSource === "measured" && <div id="gram-source-measured" role="tabpanel" data-testid="measured-test-grams" className="mt-3 flex flex-wrap gap-1.5">
                                {measuredGrams.map(({ id, gram, extraPauseMs }) => {
                                    const selected = gramsPreferences.grams.includes(gram)
                                    return <button key={id} type="button" disabled={running} aria-label={`${gram}, ${extraPauseMs} ms extra pause`} aria-pressed={selected} onClick={() => toggleGram(gram)} className={`btn btn-xs h-8 gap-1.5 px-2.5 font-mono ${selected ? "border-primary/30 bg-primary/15 text-primary hover:bg-primary/20" : "btn-ghost border-base-content/15"}`}><span className="font-semibold">{gram}</span><span className={selected ? "text-primary/80" : "text-base-content/55"}>+{extraPauseMs} ms</span></button>
                                })}
                            </div>}

                            {gramSource === "recent" && <div id="gram-source-recent" role="tabpanel" data-testid="recent-custom-grams" className="mt-3 flex flex-wrap gap-1.5">
                                {customGramsPreference.entries.map(({ gram }) => {
                                    const selected = gramsPreferences.grams.includes(gram)
                                    return <button key={gram} type="button" disabled={running} aria-pressed={selected} onClick={() => toggleGram(gram)} className={`btn btn-xs h-8 font-mono ${selected ? "border-primary/30 bg-primary/15 text-primary hover:bg-primary/20" : "btn-ghost border-base-content/15"}`}>{gram}</button>
                                })}
                            </div>}

                            {gramSource === "common" && <div id="gram-source-common" role="tabpanel" data-testid="common-language-grams" className="mt-3 flex flex-wrap gap-1.5">
                                {commonGrams.map(({ gram }) => {
                                    const selected = gramsPreferences.grams.includes(gram)
                                    return <button key={gram} type="button" disabled={running} aria-pressed={selected} onClick={() => toggleGram(gram)} className={`btn btn-xs h-8 font-mono ${selected ? "border-primary/30 bg-primary/15 text-primary hover:bg-primary/20" : "btn-ghost border-base-content/15"}`}>{gram}</button>
                                })}
                            </div>}
                        </div>
                    </section>
                )}
            </div>
        </div>
    )
}

export default Practice
