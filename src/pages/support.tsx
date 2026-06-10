import type { NextPage } from 'next';
import { SupportCard } from '~/components/support/SupportCard';

const Support: NextPage = () => {

    return (
        <main className="h-full w-full overflow-y-auto bg-base-100">
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center gap-8 px-4 py-10 sm:px-6 lg:px-8">
                <header className="max-w-3xl">
                    <p className="text-sm font-semibold uppercase tracking-wide text-primary">Support</p>
                    <h1 className="mt-3 text-3xl font-bold leading-tight text-base-content sm:text-4xl">Support TypeCafe</h1>
                    <p className="mt-5 text-base leading-7 text-base-content/75">
                        TypeCafe is built as a focused, low-friction typing space. Contributions help keep it fast, ad-free, and actively maintained.
                    </p>
                </header>

                <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:items-start">
                    <div className="rounded-lg border border-base-300 bg-base-200/40 p-5">
                        <h2 className="text-lg font-bold">What Support Helps With</h2>
                        <ul className="mt-4 space-y-3 text-sm leading-6 text-base-content/75">
                            <li>Hosting, database, and storage costs as more people save progress and profile data.</li>
                            <li>Playwright coverage, visual QA, and maintenance work that keeps the app dependable.</li>
                            <li>New typing lessons, better practice insights, and polish for the everyday typing flow.</li>
                        </ul>
                    </div>

                    <SupportCard showDismiss={false} />
                </section>
            </div>
        </main>
    );
};

export default Support;
