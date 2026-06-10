import { useEffect, useRef } from "react";
import { HexColorPicker, HexColorInput } from "react-colorful";

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
                <HexColorInput
                    color={color}
                    onChange={setColor}
                    prefixed
                    placeholder="#ffffff"
                    className="input input-bordered input-sm w-full"
                />
            </div>
        </div>
    )
}