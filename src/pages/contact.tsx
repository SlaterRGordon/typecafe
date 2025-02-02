import { useState } from 'react';
import { NextPage } from 'next';

const Contact: NextPage = () => {
    const [formData, setFormData] = useState({ name: '', email: '', message: '' });
    const [status, setStatus] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('Sending...');

        try {
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            if (response.ok) {
                setStatus('Message sent successfully!');
                setFormData({ name: '', email: '', message: '' });
            } else {
                setStatus('Failed to send message.');
            }
        } catch (error) {
            setStatus('Failed to send message.');
        }
    };

    return (
        <div className="container mx-auto p-4">
            <div className="flex flex-col justify-center items-center min-h-screen">
                <div className="card w-full max-w-lg shadow-2xl bg-base-100">
                    <div className="card-body">
                        <h2 className="card-title text-2xl font-bold">Contact Us</h2>
                        <form onSubmit={handleSubmit}>
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text">Name</span>
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Your Name"
                                    className="input input-bordered"
                                    required
                                />
                            </div>
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text">Email</span>
                                </label>
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="Your Email"
                                    className="input input-bordered"
                                    required
                                />
                            </div>
                            <div className="form-control">
                                <label className="label">
                                    <span className="label-text">Message</span>
                                </label>
                                <textarea
                                    name="message"
                                    value={formData.message}
                                    onChange={handleChange}
                                    placeholder="Your Message"
                                    className="textarea textarea-bordered h-24"
                                    required
                                ></textarea>
                            </div>
                            <div className="form-control mt-6">
                                <button className="btn btn-primary" type="submit">Send Message</button>
                            </div>
                        </form>
                        {status && <p className="mt-4 text-center">{status}</p>}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Contact;