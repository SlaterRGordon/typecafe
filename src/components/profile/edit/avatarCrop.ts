import type { Area } from "react-easy-crop";

const AVATAR_OUTPUT_SIZE = 512;

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new window.Image();
        image.addEventListener("load", () => resolve(image));
        image.addEventListener("error", () => reject(new Error("Could not load profile picture.")));
        image.src = src;
    });
}

export async function getCroppedAvatarFile(imageSrc: string, crop: Area, fileName: string) {
    const image = await loadImage(imageSrc);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
        throw new Error("Could not prepare profile picture.");
    }

    canvas.width = AVATAR_OUTPUT_SIZE;
    canvas.height = AVATAR_OUTPUT_SIZE;

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        AVATAR_OUTPUT_SIZE,
        AVATAR_OUTPUT_SIZE,
    );

    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/webp", 0.9);
    });

    if (!blob) {
        throw new Error("Could not crop profile picture.");
    }

    return new File([blob], fileName.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" });
}
