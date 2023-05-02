
import { SignInModal } from "../SignInModal";
import { TopNavigation } from "./TopNavigation";
import { SideNavigation } from "./SideNavigation";
import { BottomNavigation } from "./BottomNavigation";
import { ColorModal } from "../colors/ColorModal";

export const Navigation = () => {

    return (
        <>  
            <TopNavigation />
            <SideNavigation />
            <BottomNavigation />
            <SignInModal />
            <ColorModal />
        </>
    )
}