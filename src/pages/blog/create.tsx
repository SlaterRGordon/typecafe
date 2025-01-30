import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { api } from "~/utils/api";
import { NextPage } from "next";
import dynamic from "next/dynamic";
import 'react-quill/dist/quill.snow.css';
import { getSession } from "next-auth/react";
const ReactQuill = dynamic(() => import("react-quill"), { ssr: false });

const CreateBlogPost: NextPage = () => {
    const router = useRouter();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [previewImage, setPreviewImage] = useState<File | null>(null);
    const [blogContent, setBlogContent] = useState<string>("");
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const checkAdmin = async () => {
            const session = await getSession();
            if (session) {
                const response = await fetch('/api/user');
                const userData = await response.json();
                if (!userData.isAdmin) {
                    setIsAdmin(true);
                } else {
                    router.push('/');
                }
            } else {
                router.push('/');
            }
        };

        checkAdmin();
    }, []);

    if (!isAdmin) {
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const formData = new FormData();
        formData.append('title', title);
        formData.append('description', description);
        formData.append('content', blogContent);
        if (previewImage) {
            formData.append('image', previewImage);
        }

        const response = await fetch('/api/blog/create', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            router.push("/blog");
        } else {
            console.error('Failed to create blog post');
        }
    };

    return (
        <div className="flex w-full h-full justify-center">
            <div className="flex flex-col w-full overflow-x-auto overflow-y-scroll py-8 gap-2">
                <div className="px-4">
                    <h1 className="text-3xl font-bold mb-4">Create Blog Post</h1>
                    <form onSubmit={handleSubmit}>
                        <div className="form-control mb-4">
                            <label className="label">
                                <span className="label-text">Title</span>
                            </label>
                            <input
                                type="text"
                                className="input input-bordered"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                name="title"
                                required
                            />
                        </div>
                        <div className="form-control mb-4">
                            <label className="label">
                                <span className="label-text">Description</span>
                            </label>
                            <textarea
                                className="textarea textarea-bordered"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                name="description"
                                required
                            />
                        </div>
                        <div className="form-control mb-4">
                            <label className="label">
                                <span className="label-text">Preview Image</span>
                            </label>
                            <input
                                type="file"
                                className="file-input file-input-bordered w-full max-w-xs"
                                accept="image/*"
                                onChange={(e) => setPreviewImage(e.target.files?.[0] || null)}
                                name="image"
                            />
                        </div>
                        <div className="form-control mb-4">
                            <label className="label">
                                <span className="label-text">Blog Content</span>
                            </label>
                            <ReactQuill
                                value={blogContent as string}
                                onChange={(content) => setBlogContent(content)}
                            />
                        </div>
                        <div className="form-control mt-6">
                            <button type="submit" className="btn btn-primary">
                                Create Blog Post
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CreateBlogPost;