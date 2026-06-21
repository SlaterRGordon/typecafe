import Image from "next/image";
import { avatarColor, avatarInitial } from "~/lib/avatar";

interface AvatarProps {
    // Profile image URL; when absent, a deterministic coloured initial is shown.
    image?: string | null;
    // Display name used for the fallback colour + initial (username, name, …).
    name?: string | null;
    // Rendered square size in px.
    size: number;
    className?: string;
}

// The one avatar used everywhere: a circular picture, or a deterministic
// coloured initial when there's no picture (never a blank circle). Presentational
// — callers pass the user's image/name (e.g. from the session or a row).
export const Avatar = ({ image, name, size, className }: AvatarProps) => {
    const dimensions = { width: size, height: size };

    if (image) {
        return (
            <div className={`relative shrink-0 overflow-hidden rounded-full ${className ?? ""}`} style={dimensions}>
                <Image src={image} alt="Profile picture" fill sizes={`${size}px`} className="object-cover" referrerPolicy="no-referrer" />
            </div>
        );
    }

    return (
        <div
            className={`flex shrink-0 items-center justify-center rounded-full font-bold leading-none text-white ${className ?? ""}`}
            style={{ ...dimensions, backgroundColor: avatarColor(name ?? ""), fontSize: Math.round(size * 0.42) }}
            aria-label={name ?? "User"}
        >
            {avatarInitial(name)}
        </div>
    );
};
