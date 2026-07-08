import { useLanguage } from "~/hooks/useLanguage";
import { PICKER_LANGUAGES, languageMeta } from "~/lib/languageMeta";

// The global language picker. Flag emoji don't render on Windows browsers, so the
// trigger is a globe + the active language's short code. Writing the language here
// is read app-wide (typer, training, drills, progress, profile) via useLanguage.
export const LanguageMenu = () => {
    const [language, setLanguage] = useLanguage();
    const active = languageMeta(language);

    return (
        <div className="dropdown dropdown-end">
            <label
                tabIndex={0}
                data-testid="nav-language-trigger"
                className="btn btn-sm gap-2 normal-case bg-base-100 text-base-content border border-base-content/20 hover:bg-base-200"
                aria-label={`Language: ${active.label}`}
                title={`Language: ${active.label}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20m6.93 6h-2.95a15.7 15.7 0 0 0-1.38-3.56A8.03 8.03 0 0 1 18.92 8M12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96M4.26 14a7.8 7.8 0 0 1 0-4h3.38a16.5 16.5 0 0 0 0 4zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56A7.99 7.99 0 0 1 5.08 16m2.95-8H5.08a7.99 7.99 0 0 1 4.33-3.56A15.7 15.7 0 0 0 8.03 8M12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96M14.34 14H9.66a14.7 14.7 0 0 1 0-4h4.68a14.7 14.7 0 0 1 0 4m.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95a7.99 7.99 0 0 1-4.33 3.56M16.36 14a16.5 16.5 0 0 0 0-4h3.38a7.8 7.8 0 0 1 0 4z" /></svg>
                <span className="uppercase">{active.short}</span>
            </label>
            <ul
                tabIndex={0}
                data-testid="nav-language-menu"
                className="dropdown-content menu z-[60] mt-2 w-44 rounded-box bg-base-100 p-2 shadow"
            >
                {PICKER_LANGUAGES.map((option) => (
                    <li key={option.value}>
                        <button
                            type="button"
                            aria-pressed={option.value === language}
                            className={option.value === language ? "active font-semibold" : ""}
                            onClick={(event) => {
                                setLanguage(option.value);
                                event.currentTarget.blur();
                            }}
                        >
                            {option.label}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
