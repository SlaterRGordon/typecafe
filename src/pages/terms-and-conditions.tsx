import { NextPage } from "next";

const TermsAndConditions: NextPage = () => {
    return (
        <div className="flex w-full h-full justify-center">
            <div className="flex flex-col overflow-x-auto overflow-y-scroll py-8 gap-2">
                <div className="px-4">
                    <h1 className="text-2xl font-bold mb-4">Terms and Conditions</h1>
                    <p>Last updated: January 25th, 2025</p>
                    <br />
                    <p>
                        Please read these terms and conditions carefully before using Our Service.
                    </p>
                    <h2 className="text-xl font-semibold mt-4">Acknowledgment</h2>
                    <p>
                        These are the Terms and Conditions governing the use of this Service and the agreement that operates between You and the Company. These Terms and Conditions set out the rights and obligations of all users regarding the use of the Service.
                    </p>
                    <p>
                        Your access to and use of the Service is conditioned on Your acceptance of and compliance with these Terms and Conditions. These Terms and Conditions apply to all visitors, users, and others who access or use the Service.
                    </p>
                    <p>
                        By accessing or using the Service You agree to be bound by these Terms and Conditions. If You disagree with any part of these Terms and Conditions then You may not access the Service.
                    </p>
                    <h2 className="text-xl font-semibold mt-4">Termination</h2>
                    <p>
                        We may terminate or suspend Your access immediately, without prior notice or liability, for any reason whatsoever, including without limitation if You breach these Terms and Conditions.
                    </p>
                    <p>
                        Upon termination, Your right to use the Service will cease immediately.
                    </p>
                    <h2 className="text-xl font-semibold mt-4">Limitation of Liability</h2>
                    <p>
                        Notwithstanding any damages that You might incur, the entire liability of the Company and any of its suppliers under any provision of this Terms and Your exclusive remedy for all of the foregoing shall be limited to the amount actually paid by You through the Service or 100 USD if You haven't purchased anything through the Service.
                    </p>
                    <p>
                        To the maximum extent permitted by applicable law, in no event shall the Company or its suppliers be liable for any special, incidental, indirect, or consequential damages whatsoever (including, but not limited to, damages for loss of profits, loss of data or other information, for business interruption, for personal injury, loss of privacy arising out of or in any way related to the use of or inability to use the Service, third-party software and/or third-party hardware used with the Service, or otherwise in connection with any provision of this Terms), even if the Company or any supplier has been advised of the possibility of such damages and even if the remedy fails of its essential purpose.
                    </p>
                    <h2 className="text-xl font-semibold mt-4">Governing Law</h2>
                    <p>
                        The laws of the Country, excluding its conflicts of law rules, shall govern this Terms and Your use of the Service. Your use of the Application may also be subject to other local, state, national, or international laws.
                    </p>
                    <h2 className="text-xl font-semibold mt-4">Changes to These Terms and Conditions</h2>
                    <p>
                        We reserve the right, at Our sole discretion, to modify or replace these Terms at any time. If a revision is material We will make reasonable efforts to provide at least 30 days' notice prior to any new terms taking effect. What constitutes a material change will be determined at Our sole discretion.
                    </p>
                    <p>
                        By continuing to access or use Our Service after those revisions become effective, You agree to be bound by the revised terms. If You do not agree to the new terms, in whole or in part, please stop using the website and the Service.
                    </p>
                    <h2 className="text-xl font-semibold mt-4">Contact Us</h2>
                    <p>
                        If you have any questions about these Terms and Conditions, You can contact us:
                    </p>
                    <ul className="list-disc list-inside">
                        <li>By email: slater.r.gordon@gmail.com</li>
                        <li>By visiting this page on our website: <a href="https://type.cafe/contact">https://type.cafe/contact</a></li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default TermsAndConditions;