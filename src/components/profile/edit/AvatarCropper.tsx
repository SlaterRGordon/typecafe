import Cropper, { type Area } from "react-easy-crop";

interface AvatarCropperProps {
    image: string;
    crop: { x: number; y: number };
    zoom: number;
    applying: boolean;
    onApply: () => void;
    onCancel: () => void;
    onCropChange: (crop: { x: number; y: number }) => void;
    onCropComplete: (_croppedArea: Area, croppedAreaPixels: Area) => void;
    onZoomChange: (zoom: number) => void;
}

export const AvatarCropper = (props: AvatarCropperProps) => {
    return (
        <div className="flex flex-col gap-3 rounded-lg border border-base-300 bg-base-100 p-3">
            <h4 className="font-semibold text-lg">Crop Photo</h4>
            <div className="relative h-64 w-full overflow-hidden rounded-md bg-neutral">
                <Cropper
                    image={props.image}
                    crop={props.crop}
                    zoom={props.zoom}
                    aspect={1}
                    cropShape="round"
                    showGrid={false}
                    onCropChange={props.onCropChange}
                    onCropComplete={props.onCropComplete}
                    onZoomChange={props.onZoomChange}
                />
            </div>
            <label className="flex items-center gap-3">
                <span className="text-sm font-medium">Zoom</span>
                <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    value={props.zoom}
                    className="range range-primary range-sm"
                    onChange={(event) => props.onZoomChange(Number(event.target.value))}
                />
            </label>
            <div className="flex gap-2">
                <button type="button" className="btn btn-sm btn-primary" disabled={props.applying} onClick={props.onApply}>
                    {props.applying ? <div className="w-5 h-5 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div> : "Apply"}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" disabled={props.applying} onClick={props.onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
};
