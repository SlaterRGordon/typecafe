import { useState } from 'react';
import type { NextPage } from 'next';

const Contact: NextPage = () => {
    const [formData, setFormData] = useState({ name: '', email: '', message: '' });
    const [status, setStatus] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData({ ...formData, [name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('Sending...');
        setIsSubmitting(true);

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
        } catch {
            setStatus('Failed to send message.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="h-full w-full overflow-y-auto bg-base-100">
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-center gap-8 px-4 py-10 sm:px-6 lg:px-8">
                <header className="max-w-2xl">
                    <p className="text-sm font-semibold uppercase tracking-wide text-primary">Contact</p>
                    <h1 className="mt-3 text-3xl font-bold leading-tight text-base-content sm:text-4xl">Contact TypeCafe</h1>
                    <p className="mt-5 text-base leading-7 text-base-content/75">
                        Questions, bug reports, privacy requests, and thoughtful feedback are welcome. Send a note and I will get back to you when I can.
                    </p>
                </header>

                <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:items-start">
                    <div className="rounded-lg border border-base-300 bg-base-200/40 p-5">
                        <h2 className="text-lg font-bold">Before You Send</h2>
                        <ul className="mt-4 space-y-3 text-sm leading-6 text-base-content/75">
                            <li>For account or privacy requests, include the email address connected to your TypeCafe account.</li>
                            <li>For bugs, include the browser, device, page, and what you expected to happen.</li>
                            <li>Please do not send passwords or sensitive personal information through this form.</li>
                        </ul>
                    </div>

                    <form className="flex flex-col gap-4 rounded-lg border border-base-300 bg-base-200/40 p-5" onSubmit={handleSubmit}>
                        <div className="form-control">
                            <label className="label" htmlFor="contactName">
                                <span className="label-text font-semibold">Name</span>
                            </label>
                            <input
                                id="contactName"
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Your Name"
                                className="input input-bordered w-full"
                                autoComplete="name"
                                required
                            />
                        </div>
                        <div className="form-control">
                            <label className="label" htmlFor="contactEmail">
                                <span className="label-text font-semibold">Email</span>
                            </label>
                            <input
                                id="contactEmail"
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="Your Email"
                                className="input input-bordered w-full"
                                autoComplete="email"
                                required
                            />
                        </div>
                        <div className="form-control">
                            <label className="label" htmlFor="contactMessage">
                                <span className="label-text font-semibold">Message</span>
                            </label>
                            <textarea
                                id="contactMessage"
                                name="message"
                                value={formData.message}
                                onChange={handleChange}
                                placeholder="Your Message"
                                className="textarea textarea-bordered min-h-36 w-full"
                                required
                            ></textarea>
                        </div>
                        <button className="btn btn-primary mt-2" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? <div className="w-5 h-5 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div> : "Send Message"}
                        </button>
                        {status && <p role="status" className="text-sm text-base-content/70">{status}</p>}
                    </form>
                </section>
            </div>
        </main>
    );
};

export default Contact;
