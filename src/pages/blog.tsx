import { type NextPage } from "next";
import { BlogCard } from "~/components/blog/BlogCard";
import { api } from "~/utils/api";

const Blog: NextPage = () => {
  const { data: blogs, isLoading, error } = api.blog.getAll.useQuery();

  if (isLoading) {
    return <div className="loading-spinner"></div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {blogs?.map((blog) => (
        <BlogCard
          key={blog.id}
          id={blog.id}
          title={blog.title}
          description={blog.content.substring(0, 100) + "..."}
          imageUrl={`data:image/png;base64,${blog.images[0]?.blob.toString('base64')}`}
        />
      ))}
    </div>
  );
};

export default Blog;
