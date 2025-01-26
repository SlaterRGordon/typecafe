import Image from "next/image";
import Link from "next/link";

interface BlogCardProps {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
}

export const BlogCard = ({ id, title, description, imageUrl }: BlogCardProps) => {
  return (
    <div className="card lg:card-side bg-base-100 shadow-xl">
      <figure>
        <Image
          src={imageUrl}
          alt={title}
          width={400}
          height={250}
          className="object-cover"
        />
      </figure>
      <div className="card-body">
        <h2 className="card-title">{title}</h2>
        <p>{description}</p>
        <div className="card-actions justify-end">
          <Link href={`/blog/${id}`}>
            <a className="btn btn-primary">Read More...</a>
          </Link>
        </div>
      </div>
    </div>
  );
};