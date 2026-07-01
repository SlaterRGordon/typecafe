
import { SignInModal } from "../SignInModal";
import { TopNavigation } from "./TopNavigation";
import { SideNavigation } from "./SideNavigation";
import { BottomNavigation } from "./BottomNavigation";
import { ColorModal } from "../colors/ColorModal";
import { UsernameModal } from "../UsernameModal";
import { HomeCoachTabs } from "../home/HomeCoachTabs";

export const Navigation = () => {

    return (
        <>  
            <TopNavigation />
            <SideNavigation />
            <HomeCoachTabs className="typing-focus-global-fade" inline={false} />
            <BottomNavigation />
            <SignInModal />
            <ColorModal />
            <UsernameModal />
        </>
    )
}
