
import { SignInModal } from "../SignInModal";
import { TopNavigation } from "./TopNavigation";
import { SideNavigation } from "./SideNavigation";
import { BottomNavigation } from "./BottomNavigation";
import { ColorModal } from "../ColorModal";
import { useEffect, useState } from "react";
import { Popover } from "../Popover";
import { useWindowSize } from "usehooks-ts";

export const Navigation = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [color, setColor] = useState('#fff');
    const [position, setPosition] = useState({ left: 0, top: 0 });

    const { width, height } = useWindowSize()

    useEffect(() => {
        setIsOpen(false)
    }, [width, height])

    const togglePopover = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
        e.stopPropagation()
        setPosition({ left: e.currentTarget.getBoundingClientRect().left, top: e.currentTarget.getBoundingClientRect().top+32})
        setIsOpen(isOpen => !isOpen)
    }

    return (
        <>  
            <TopNavigation />
            <SideNavigation />
            <BottomNavigation />
            <SignInModal />
            <ColorModal color={color} onClick={togglePopover} />
            <Popover color={color} setColor={setColor} isOpen={isOpen} togglePopover={() => setIsOpen(isOpen => !isOpen)} position={position} />
        </>
    )
}