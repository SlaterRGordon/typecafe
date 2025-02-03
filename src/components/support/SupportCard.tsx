interface SupportCardProps {
    showDismiss: boolean;
    onDismiss?: () => void;
}

export const SupportCard = (props: SupportCardProps) => {
    const { showDismiss, onDismiss} = props;

    return (
        <div className="card w-full max-w-lg shadow-2xl bg-base-300">
            {showDismiss && onDismiss &&
                <div className="absolute right-0">
                    <button className="btn btn-circle btn-ghost m-2" onClick={onDismiss}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="icon icon-tabler icon-tabler-x" width="24" height="24" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>}
            <div className="card-body gap-4">
                <div className="flex flex-col">
                <h2 className="card-title text-2xl font-bold">Support TypeCafe</h2>
                    <h5 className='card-description text-xl text-neutral-content'>
                        Please consider support my work by buying me a coffee or donating to my Ko-fi page.
                        Your support helps me keep the site running. Thank you!
                    </h5>
                </div>
                <div className='flex gap-4'>
                    <a href="https://www.buymeacoffee.com/typecafe" target="_blank">
                        <img
                            src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png"
                            alt="Buy Me A Coffee"
                            height='36'
                            style={{ border: "0px", height: "36px", borderRadius: "0.75rem", width: "150px" }}
                        />

                    </a>
                    <a href='https://ko-fi.com/G2G519ZC63' target='_blank'>
                        <img
                            height='36'
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