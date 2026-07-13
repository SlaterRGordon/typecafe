interface KeyboardLayerSwitchProps {
    shiftLayer: boolean,
    altgrLayer: boolean,
    hasAltGr: boolean,
    onSelectBase: () => void,
    onToggleShift: () => void,
    onToggleAltgr: () => void,
    testId?: string,
}

const layerButtonClass = (active: boolean) =>
    `min-w-20 cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${active ? "bg-primary text-primary-content shadow-sm" : "text-base-content/55 hover:bg-base-content/5 hover:text-base-content"}`

export function KeyboardLayerSwitch({
    shiftLayer,
    altgrLayer,
    hasAltGr,
    onSelectBase,
    onToggleShift,
    onToggleAltgr,
    testId,
}: KeyboardLayerSwitchProps) {
    const baseLayer = !shiftLayer && !altgrLayer

    return (
        <div
            className="grid min-h-11 grid-flow-col auto-cols-fr rounded-xl border border-base-content/10 bg-base-100/40 p-1"
            role="group"
            aria-label="Keyboard layer"
            data-testid={testId}
        >
            <button type="button" aria-pressed={baseLayer} onClick={onSelectBase} className={layerButtonClass(baseLayer)}>
                Base
            </button>
            <button
                type="button"
                aria-pressed={shiftLayer}
                aria-label="Show shifted keys (capitals and symbols)"
                title="Show shifted keys (capitals & symbols) - or hold Shift"
                onClick={onToggleShift}
                className={layerButtonClass(shiftLayer)}
            >
                <span aria-hidden="true">⇧ </span>Shift
            </button>
            {hasAltGr &&
                <button
                    type="button"
                    aria-pressed={altgrLayer}
                    aria-label="Show AltGr keys (accents and symbols)"
                    title="Show AltGr keys - or hold AltGr"
                    onClick={onToggleAltgr}
                    className={layerButtonClass(altgrLayer)}
                >
                    AltGr
                </button>
            }
        </div>
    )
}
