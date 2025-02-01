import Image from "next/image";

interface BlogContentBlockProps {
  contentBlock: {
    id: string;
    type: "HEADER" | "PARAGRAPH" | "IMAGE";
    content?: string | null;
    image?: {
      blob: Buffer;
    } | null;
  };
}

export const BlogContentBlock = ({ contentBlock }: BlogContentBlockProps) => {
  switch (contentBlock.type) {
    case "HEADER":
      return <h2 className="text-2xl font-bold my-4">{contentBlock.content}</h2>;
    case "PARAGRAPH":
      return <p className="my-2">{contentBlock.content}</p>;
    case "IMAGE":
      return (
        <div className="my-4">
          {contentBlock.image && (
            <Image
              src={`data:image/png;base64,${contentBlock.image.blob.toString('base64')}`}
              alt="Blog Image"
              width={800}
              height={450}
              className="object-cover"
            />
          )}
        </div>
      );
    default:
      return null;
  }
};