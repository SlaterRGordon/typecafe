import type { NextPage } from "next";
import { DocumentPage, DocumentSection } from "~/components/legal/DocumentPage";

const contactEmail = "slater.r.gordon@gmail.com";
const contactUrl = "https://typecafe.vercel.app/contact";

const TermsAndConditions: NextPage = () => {
    return (
        <DocumentPage
            eyebrow="Terms"
            title="Terms and Conditions"
            updated="June 8, 2026"
            intro="These terms explain the basic rules for using TypeCafe. By using the site, creating an account, or submitting content, you agree to these terms."
        >
            <DocumentSection title="Using TypeCafe">
                <p>TypeCafe provides typing tests, practice tools, learn progress, public profiles, leaderboards, and related features. You may use the service for personal, educational, or non-commercial practice as long as you follow these terms.</p>
                <p>You must be able to enter into these terms under the laws that apply to you. TypeCafe is not intended for children under 13.</p>
            </DocumentSection>

            <DocumentSection title="Accounts">
                <p>You are responsible for the activity on your account and for keeping your login information secure. You agree to provide accurate account information and to avoid impersonating another person.</p>
                <p>You may delete your account from the profile edit flow. We may suspend or remove accounts that abuse the service, interfere with other users, or violate these terms.</p>
            </DocumentSection>

            <DocumentSection title="Public Profiles and User Content">
                <p>If you add a username, profile picture, bio, profile link, or leaderboard score, that information may be visible to other users. Do not upload or publish anything unlawful, abusive, misleading, infringing, private, or unsafe.</p>
                <p>You keep ownership of content you provide, but you give TypeCafe permission to host, store, process, resize, display, and transmit it as needed to operate the service.</p>
            </DocumentSection>

            <DocumentSection title="Fair Use of the Service">
                <p>You agree not to attack, scrape, spam, overload, reverse engineer, bypass security, exploit bugs, automate abusive traffic, manipulate leaderboard data, or use TypeCafe in a way that harms the service or other users.</p>
            </DocumentSection>

            <DocumentSection title="Third-Party Services">
                <p>TypeCafe uses third-party providers for hosting, authentication, storage, analytics, email, and support links. Your use of third-party services may also be governed by their own terms and policies.</p>
            </DocumentSection>

            <DocumentSection title="No Warranty">
                <p>TypeCafe is provided as is and as available. We try to keep it useful and reliable, but we do not guarantee that the service will be uninterrupted, error-free, secure, or available at all times.</p>
                <p>Typing scores, stats, practice feedback, and leaderboard positions are provided for practice and comparison only. They are not professional, educational, employment, medical, legal, or financial advice.</p>
            </DocumentSection>

            <DocumentSection title="Limitation of Liability">
                <p>To the fullest extent permitted by law, TypeCafe and its operator will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of data, profits, goodwill, or business opportunities related to your use of the service.</p>
                <p>To the fullest extent permitted by law, the total liability for any claim related to TypeCafe will be limited to the greater of the amount you paid to use TypeCafe in the previous 12 months or 100 USD.</p>
            </DocumentSection>

            <DocumentSection title="Termination">
                <p>We may suspend or terminate access to TypeCafe at any time if we believe you have violated these terms, created risk for the service, or used the service abusively. You may stop using TypeCafe at any time.</p>
            </DocumentSection>

            <DocumentSection title="Governing Law">
                <p>These terms are governed by the laws of British Columbia, Canada, and applicable federal laws of Canada, without regard to conflict of law rules. Local consumer protection laws may still apply where they cannot be waived.</p>
            </DocumentSection>

            <DocumentSection title="Changes to These Terms">
                <p>We may update these terms as TypeCafe changes. If changes are material, we will make reasonable efforts to provide notice through the site or another appropriate channel. Continued use after changes take effect means you accept the updated terms.</p>
            </DocumentSection>

            <DocumentSection title="Contact">
                <p>Questions about these Terms and Conditions can be sent by email to <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or through the contact page at <a href={contactUrl}>{contactUrl}</a>.</p>
            </DocumentSection>
        </DocumentPage>
    );
};

export default TermsAndConditions;
