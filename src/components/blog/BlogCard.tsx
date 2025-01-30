import Image from "next/image";
import Link from "next/link";

interface BlogCardProps {
  id: string;
  title: string;
  description: string;
  imageBlob?: { type: string; data: number[] };
}

export const BlogCard = ({ id, title, description, imageBlob }: BlogCardProps) => {
  console.log(imageBlob);
  const imageSrc = imageBlob ? `data:image/png;base64,${Buffer.from(imageBlob.data).toString('base64')}` : null;
  console.log(imageSrc);

  return (
    <div className="card bg-base-100 shadow-xl">
      <figure>
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt="Blog Image"
            width={800}
            height={450}
            className="object-cover"
          />
        ) : (
          <></>
        )}
      </figure>
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <p>{description}</p>
        <div className="card-actions justify-end">
          <Link href={`/blog/${id}`} className="btn btn-primary">
            Read More...
          </Link>
        </div>
      </div>
    </div>
  );
};