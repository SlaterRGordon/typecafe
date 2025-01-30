// filepath: /c:/wd/typecafe/src/pages/api/contact.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
        const { name, email, message } = req.body as { name: string; email: string; message: string };

        // Create a transporter object using SMTP transport
        const transporter = nodemailer.createTransport({
            service: 'gmail', // Use your email service
            auth: {
                user: process.env.EMAIL_USER as string, // Your email address
                pass: process.env.EMAIL_PASS as string, // Your email password
            },
        });

        // Email options
        const mailOptions = {
            from: email,
            to: process.env.EMAIL_USER as string, // Your email address
            subject: `Contact form submission from ${name}`,
            text: message,
        };

        try {
            // Send email
            await transporter.sendMail(mailOptions);
            res.status(200).json({ message: 'Email sent successfully' });
        } catch (error) {
            res.status(500).json({ message: 'Error sending email', error });
        }
    } else {
        res.status(405).json({ message: 'Method not allowed' });
    }
};

export default handler;