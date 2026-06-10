import type { ReactNode } from "react";

interface DocumentPageProps {
    title: string;
    eyebrow: string;
    updated: string;
    intro: string;
    children: ReactNode;
}

export const DocumentPage = (props: DocumentPageProps) => {
    return (
        <main className="h-full w-full overflow-y-auto bg-base-100">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
                <header className="border-b border-base-300 pb-8">
                    <p className="text-sm font-semibold uppercase tracking-wide text-primary">{props.eyebrow}</p>
                    <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-base-content sm:text-4xl">{props.title}</h1>
                    <p className="mt-3 text-sm text-base-content/60">Last updated: {props.updated}</p>
                    <p className="mt-6 max-w-3xl text-base leading-7 text-base-content/80">{props.intro}</p>
                </header>
                <article className="document-content max-w-3xl pb-16">
                    {props.children}
                </article>
            </div>
        </main>
    );
};

interface DocumentSectionProps {
    title: string;
    children: ReactNode;
}

export const DocumentSection = (props: DocumentSectionProps) => {
    return (
        <section className="border-b border-base-300 py-7 last:border-b-0">
            <h2>{props.title}</h2>
            {props.children}
        </section>
    );
};
