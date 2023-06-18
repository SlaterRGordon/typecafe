import { useEffect, useRef } from "react";
import { HexColorPicker } from "react-colorful";

interface Props {
    color: string,
    setColor: (color: string) => void,
    isOpen: boolean,
    togglePopover: () => void,
    position: { left: number, top: number }
}

export const Popover = ({color, setColor, isOpen, togglePopover, position}: Props) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node) && isOpen) {
                togglePopover();
            }
        };
        document.addEventListener('click', handleClickOutside, true);
        return () => {
            document.removeEventListener('click', handleClickOutside, true);
        };
    }, [togglePopover, isOpen]);
    
    return (
        <div className={`
            absolute flex justify-center items-center inset-0 z-[999] transition-all duration-200 cursor-pointer
            ${isOpen ? 'visible opacity-100 pointer-events-auto' : 'invisible opacity-0 pointer-events-none'}
        `}>
            <div ref={ref} style={{top: `${position.top}px`, left: `${position.left}px`}} className={`flex flex-col items-start absolute w-[140px] space-y-1`}>
                <HexColorPicker className="!w-[170px] !h-[170px]" color={color} onChange={setColor} />
                <input 
                    value={color.slice(1)} 
                    onChange={(e) => setColor('#' + e.target.value)} 
                    type="text" placeholder="Type here" 
                    className="input input-bordered input-sm w-8/12 max-w-xs w-full" 
                />
            </div>
        </div>
    )
}