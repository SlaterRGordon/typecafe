import { NextPage } from "next";
import Image from "next/image";
import { useRouter } from "next/router";
import { Avatar } from "~/components/Avatar";
import { api } from "~/utils/api";

const BlogDetailPage: NextPage = () => {
  const router = useRouter()
  const id = router.query?.Id?.toString() ?? ""
  const { data, isLoading } = api.blog.getById.useQuery({ id });

  if (isLoading) {
    return <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
  }

  if (!data) {
    return <div>Blog not found</div>;
  }

  return (
    <div className="flex w-full h-full justify-center">
      <div className="flex flex-col w-full overflow-x-auto overflow-y-scroll py-8 gap-2">
        <div className="hero">
          <div className="hero-overlay bg-opacity-20"></div>
          <div className="hero-content text-neutral-content">
            <div className="max-w-3xl">
              <h1 className="mb-5 text-5xl font-bold">{data.title}</h1>
              <div className="flex items-center gap-4">
                <Image className="rounded-full" width={64} height={64} src={data.author.image ?? ""} alt="Profile Picture" referrerPolicy="no-referrer" />
                <div className="flex flex-col justify-center items-center">
                  <p>{data.author.name}</p>
                  <p>{new Date(data.createdAt).toLocaleDateString('en-us', {year:"numeric", month:"short", day:"numeric"})}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="blog-content px-4">
          <div dangerouslySetInnerHTML={{ __html: data.content }} />
        </div>
      </div>
    </div>
  );
};

export default BlogDetailPage;