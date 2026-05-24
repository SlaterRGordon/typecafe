import type { ReactNode } from "react";
import { Alerts } from "./Alerts";
import { Navigation } from "./navigation/Navigation"


export default function Layout({ children }: { children: ReactNode }) {

    return (
        <>
            <Alerts />
            <Navigation />
            <main
                id="main"
                className="flex h-full w-full min-w-0 max-w-full justify-center items-center box-border overflow-hidden pt-[4rem] pb-[4rem] md:pl-[4.6rem] md:pb-[0rem]">
                {children}
            </main>
        </>
    );
}
