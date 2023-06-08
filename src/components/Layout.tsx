import { Alerts } from "./Alerts";
import { Navigation } from "./navigation/Navigation"

export default function Layout({ children }: any) {
    return (
        <>  
            <Alerts />
            <Navigation />
            <main className="flex w-full h-full justify-center items-center md:ml-[4.6rem]">{children}</main>
        </>
    );
}