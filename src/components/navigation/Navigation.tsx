
import { SignInModal } from "../SignInModal";
import { TopNavigation } from "./TopNavigation";
import { SideNavigation } from "./SideNavigation";
import { BottomNavigation } from "./BottomNavigation";
import { ColorModal } from "../colors/ColorModal";
import { UsernameModal } from "../UsernameModal";

export const Navigation = () => {

    return (
        <>  
            <TopNavigation />
            <SideNavigation />
            <BottomNavigation />
            <SignInModal />
            <ColorModal />
            <UsernameModal />
        </>
    )
}