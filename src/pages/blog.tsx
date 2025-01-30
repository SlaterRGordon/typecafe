import { BlogPost } from "@prisma/client";
import { type NextPage } from "next";
import { useEffect, useState } from "react";
import { BlogCard } from "~/components/blog/BlogCard";

const Blog: NextPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<String | null>(null);
  const [blogs, setBlogs] = useState<any[]>([]);

  useEffect(() => {
    getBlogPosts();
  }, []);

  const getBlogPosts = async () => {
    setLoading(true);
    const response = await fetch('/api/blog/getAll');
    setLoading(false);

    if (response.ok) {
      const data = await response.json();
      console.log(data);
      setBlogs(data);
    } else {
      console.error('Failed to fetch blog posts');
      setError(response.statusText);
    }
  }

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
