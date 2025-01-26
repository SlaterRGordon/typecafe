import { NextPage } from "next";
import { useRouter } from "next/router";
import { api } from "~/utils/api";

const BlogDetailPage: NextPage = () => {
  const router = useRouter();
  const { id } = router.query;

  const { data: blog, isLoading, error } = api.blog.getById.useQuery({ id: id as string }, {
    enabled: !!id,
  });

  if (isLoading) {
    return <div className="loading-spinner"></div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  if (!blog) {
    return <div>Blog not found</div>;
  }

  return (
    <div>
      <h1>{blog.title}</h1>
      <p>{blog.content}</p>
      <div>
        {blog.images.map((image) => (
          <img key={image.id} src={`data:image/png;base64,${image.blob.toString('base64')}`} alt="Blog Image" />
        ))}
      </div>
      <p>Author: {blog.author.name}</p>
      <p>Created At: {new Date(blog.createdAt).toLocaleDateString()}</p>
    </div>
  );
};

export default BlogDetailPage;