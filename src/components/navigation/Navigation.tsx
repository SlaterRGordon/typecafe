
import { SignInModal } from "../SignInModal";
import { TopNavigation } from "./TopNavigation";
import { SideNavigation } from "./SideNavigation";
import { BottomNavigation } from "./BottomNavigation";
import { ColorModal } from "../ColorModal";

export const Navigation = () => {

    return (
        <>
            <TopNavigation />
            <SideNavigation />
            <BottomNavigation />
            <SignInModal />
        </>
    )
}