import { useLayout } from "~/hooks/useLayout";
import { AUTO_LAYOUT, PICKER_LAYOUTS, layoutMeta } from "~/lib/keyboardLayout";

// The global keyboard-layout picker, mirroring LanguageMenu. Writing the layout
// here is read app-wide (boards, heatmaps, the train ladder) via useLayout.
// Display/teaching only - it never remaps input. First entry is Auto (follow
// the language, refined by detection), showing what it currently resolves to;
// explicit picks below are pinned and grouped standard/alternative
// (docs/features/keyboard-layouts.md decision 4).
export const LayoutMenu = () => {
    const [layout, setLayout, stored, autoLayout] = useLayout();
    const isAuto = stored === AUTO_LAYOUT;
    // Auto always previews what it would resolve to (language/detection default),
    // never the current explicit pin; the trigger shows the pinned label instead.
    const autoLabel = layoutMeta(autoLayout).label;
    const activeLabel = isAuto ? `Auto - ${autoLabel}` : layoutMeta(layout).label;

    const group = (kind: "national" | "remap") =>
        PICKER_LAYOUTS.filter((option) => option.kind === kind).map((option) => (
            <li key={option.value}>
                <button
                    type="button"
                    aria-pressed={!isAuto && option.value === stored}
                    className={!isAuto && option.value === stored ? "active font-semibold" : ""}
                    onClick={(event) => {
                        setLayout(option.value);
                        event.currentTarget.blur();
                    }}
                >
                    {option.label}
                </button>
            </li>
        ));

    return (
        <div className="dropdown dropdown-end">
            <button
                type="button"
                data-testid="nav-layout-trigger"
                className="btn btn-sm !h-11 !min-h-11 min-w-11 gap-2 border border-base-content/20 bg-base-100 px-3 text-base-content normal-case hover:bg-base-200"
                aria-haspopup="menu"
                aria-label={`Keyboard layout: ${activeLabel}`}
                title={`Keyboard layout: ${activeLabel}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z" /></svg>
                {/* Icon-only on phones - the label alongside globe/colors/auth
                    overflows the mobile bar. */}
                <span className="hidden sm:inline">{activeLabel}</span>
            </button>
            <ul
                tabIndex={0}
                data-testid="nav-layout-menu"
                className="dropdown-content menu z-[60] mt-2 w-52 rounded-box bg-base-100 p-2 shadow"
            >
                <li>
                    <button
                        type="button"
                        data-testid="nav-layout-auto"
                        aria-pressed={isAuto}
                        className={isAuto ? "active font-semibold" : ""}
                        onClick={(event) => {
                            setLayout(AUTO_LAYOUT);
                            event.currentTarget.blur();
                        }}
                    >
                        Auto - {autoLabel}
                    </button>
                </li>
                <li className="menu-title">Standard</li>
                {group("national")}
                <li className="menu-title">Alternative</li>
                {group("remap")}
            </ul>
        </div>
    );
};
