import type { NextPage } from "next";
import { DocumentPage, DocumentSection } from "~/components/legal/DocumentPage";

const contactEmail = "slater.r.gordon@gmail.com";
const contactUrl = "https://typecafe.app/contact";

const PrivacyPolicy: NextPage = () => {
  return (
    <DocumentPage
      eyebrow="Privacy"
      title="Privacy Policy for TypeCafe"
      updated="June 8, 2026"
      intro="This policy explains what information TypeCafe collects, why it is used, who helps process it, and how you can request changes or deletion. TypeCafe is a typing practice and leaderboard site, so most account data exists to save progress, show scores, and keep the service working."
    >
      <DocumentSection title="Information We Collect">
        <p>We collect the information needed to provide accounts, typing practice, public profiles, support messages, and site operations.</p>
        <ul>
          <li><strong>Account information:</strong> email address, username, display name, hashed password for credential accounts, OAuth account identifiers, and authentication session data.</li>
          <li><strong>Profile information:</strong> profile picture URL, bio, and profile link. Username, profile picture, bio, profile link, and public score information may be visible to other users.</li>
          <li><strong>Typing data:</strong> typing scores, speed, accuracy, selected test settings, practice statistics, train progress, and color/theme preferences.</li>
          <li><strong>Contact information:</strong> name, email address, and message content when you submit the contact form.</li>
          <li><strong>Technical and usage data:</strong> IP address, browser information, device information, pages visited, timestamps, and diagnostic data collected by hosting, analytics, and security tooling.</li>
          <li><strong>Local device data:</strong> some settings, train progress, and dismissed support prompts may be stored in your browser through localStorage or similar browser storage.</li>
        </ul>
      </DocumentSection>

      <DocumentSection title="How We Use Information">
        <ul>
          <li>Provide typing tests, train mode, progress tracking, profiles, leaderboards, account login, and account deletion.</li>
          <li>Store and display profile pictures, public profile information, and leaderboard results.</li>
          <li>Respond to contact requests and support messages.</li>
          <li>Protect the service, debug issues, prevent abuse, and maintain site reliability.</li>
          <li>Understand site usage, improve TypeCafe, and keep the experience reliable.</li>
        </ul>
      </DocumentSection>

      <DocumentSection title="Cookies, Analytics, and Local Storage">
        <p>TypeCafe uses authentication cookies and similar storage so accounts stay signed in and protected. The site also uses browser localStorage for local preferences and progress-related features.</p>
        <p>TypeCafe uses Google Analytics to understand site usage. This service may set or read cookies and collect usage data according to its own policies and controls.</p>
      </DocumentSection>

      <DocumentSection title="Service Providers">
        <p>We rely on third-party providers to operate TypeCafe. These providers process information only as needed to provide their services to us.</p>
        <ul>
          <li><strong>Hosting and infrastructure:</strong> Vercel and database/storage providers used to run the site and store application data.</li>
          <li><strong>Authentication:</strong> NextAuth/Auth.js, Google OAuth, GitHub OAuth, and credential login infrastructure.</li>
          <li><strong>Profile image storage:</strong> Vercel Blob stores uploaded profile pictures as public image files.</li>
          <li><strong>Email:</strong> Nodemailer and the configured email provider send contact form submissions.</li>
          <li><strong>Analytics:</strong> Google Analytics helps measure site usage and performance.</li>
          <li><strong>Support links:</strong> Buy Me a Coffee and Ko-fi if you choose to visit those external sites.</li>
        </ul>
      </DocumentSection>

      <DocumentSection title="Sharing and Public Information">
        <p>We do not sell your personal information. We may share information with service providers, when required by law, to protect TypeCafe or other users, with your consent, or in connection with a merger, acquisition, or similar business transfer.</p>
        <p>Public profile information and leaderboard results are intended to be visible to other users. Do not put private or sensitive information in your username, bio, profile link, or profile picture.</p>
      </DocumentSection>

      <DocumentSection title="Retention and Deletion">
        <p>We keep account and typing data for as long as your account exists or as long as needed to provide the service, comply with legal obligations, resolve disputes, or prevent abuse. Contact form emails may be retained as needed to respond and keep a record of support requests.</p>
        <p>You can update profile details from your account page and delete your account from the profile edit flow. Account deletion removes your user record and related application records where supported by the database relationships. Some logs, backups, email records, or security records may remain for a limited period.</p>
      </DocumentSection>

      <DocumentSection title="Your Choices and Rights">
        <p>You may request access, correction, or deletion of personal information by contacting us. Depending on where you live, you may have additional rights under local privacy laws.</p>
        <p>You can also control cookies and local browser storage through your browser settings. Blocking required authentication storage may prevent account features from working.</p>
      </DocumentSection>

      <DocumentSection title="Security">
        <p>We use reasonable technical and organizational safeguards for the size and nature of the service, including hashed passwords for credential accounts and server-side handling of sensitive credentials. No internet service can guarantee perfect security.</p>
      </DocumentSection>

      <DocumentSection title="Children">
        <p>TypeCafe is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information, contact us so we can review and delete it where appropriate.</p>
      </DocumentSection>

      <DocumentSection title="International Transfers">
        <p>TypeCafe and its providers may process information in Canada, the United States, or other countries where infrastructure and service providers operate. Privacy laws may differ from those in your location.</p>
      </DocumentSection>

      <DocumentSection title="Changes">
        <p>We may update this Privacy Policy as TypeCafe changes. The updated policy will be posted on this page with a new last updated date.</p>
      </DocumentSection>

      <DocumentSection title="Contact">
        <p>Questions or privacy requests can be sent by email to <a href={`mailto:${contactEmail}`}>{contactEmail}</a> or through the contact page at <a href={contactUrl}>{contactUrl}</a>.</p>
      </DocumentSection>
    </DocumentPage>
  );
};

export default PrivacyPolicy;
