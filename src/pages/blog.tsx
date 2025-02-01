import { BlogPost, Image as PrismaImage } from "@prisma/client";
import { type NextPage } from "next";
import { useEffect, useState } from "react";
import { BlogCard } from "~/components/blog/BlogCard";

interface Image extends Omit<PrismaImage, 'blob'> {
  blob: { type: string; data: number[] };
}

interface BlogPostWithImage extends BlogPost {
  image: Image | null;
}

const Blog: NextPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [blogs, setBlogs] = useState<BlogPostWithImage[]>([]);

  useEffect(() => {
    void getBlogPosts();
  }, []);

  const getBlogPosts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/blog/getAll');
      if (response.ok) {
        const data: BlogPostWithImage[] = await response.json() as BlogPostWithImage[];
        setBlogs(data);
      } else {
        console.error('Failed to fetch blog posts');
        setError(response.statusText);
      }
    } catch (err) {
      console.error('Error fetching blog posts:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
  }

  if (error) {
    return <div>Error: {error}</div>;
  }


  return (

    <div className="flex w-full h-full justify-center">
      <div className="flex flex-col w-full overflow-x-auto overflow-y-scroll p-8 gap-2">
        <div className="m-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {blogs?.map((blog) => (
            <BlogCard
              key={blog.id}
              id={blog.id}
              title={blog.title}
              description={blog.description.substring(0, 100) + "..."}
              imageBlob={blog.image?.blob}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Blog;
