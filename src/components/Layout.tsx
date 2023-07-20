import { Alerts } from "./Alerts";
import { Navigation } from "./navigation/Navigation"


export default function Layout({ children }: any) {

    return (
        <>
            <Alerts />
            <Navigation />
            <main
                id="main"
                className="flex w-full h-full justify-center items-center box-border pt-[4rem] pb-[4rem] md:pl-[4.6rem] md:pb-[0rem]">
                {children}
            </main>
        </>
    );
}