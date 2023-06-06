import { Navigation } from "./navigation/Navigation"

export default function Layout({ children }: any) {
    return (
        <>
            <Navigation />
            <main className="md:ml-[4.6rem]">{children}</main>
        </>
    );
}