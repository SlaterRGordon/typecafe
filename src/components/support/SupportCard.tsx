import Image from "next/image";

interface SupportCardProps {
    showDismiss: boolean;
    onDismiss?: () => void;
}

export const SupportCard = (props: SupportCardProps) => {
    const { showDismiss, onDismiss} = props;

    return (
        <div className="relative w-full max-w-lg rounded-lg border border-base-300 bg-base-200/60 p-5">
            {showDismiss && onDismiss &&
                <div className="absolute right-0">
                    <button className="btn btn-circle btn-ghost m-2" onClick={onDismiss} aria-label="Dismiss support prompt" title="Dismiss support prompt">
                        <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="icon icon-tabler icon-tabler-x" width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>}
            <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-2 pr-8">
                    <h2 className="text-2xl font-bold leading-tight">Keep TypeCafe Running</h2>
                    <p className="text-sm leading-6 text-base-content/75">
                        If TypeCafe has helped your typing practice, a small contribution helps cover hosting, storage, testing, and the time that keeps the site improving.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <a className="inline-flex h-10 items-center" href="https://www.buymeacoffee.com/typecafe" target="_blank" rel="noreferrer">
                        <Image
                            src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                            alt="Buy Me A Coffee"
                            width={150}
                            height={36}
                            style={{ border: "0px", height: "36px", borderRadius: "0.75rem", width: "150px" }}
                        />

                    </a>
                    <a className="inline-flex h-10 items-center" href='https://ko-fi.com/G2G519ZC63' target='_blank' rel="noreferrer">
                        <Image
                            width={150}
                            height={36}
                            style={{ border: "0px", height: "36px", width: "150px" }}
                            src='https://storage.ko-fi.com/cdn/kofi6.png?v=6'
                            alt='Support my work'
                        />
                    </a>
                </div>
            </div>
        </div>
    )
}
