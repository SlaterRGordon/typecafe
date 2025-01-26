import { NextPage } from "next";

const PrivacyPolicy: NextPage = () => {
  return (
    <div className="flex w-full h-full justify-center">
      <div className="flex flex-col overflow-x-auto overflow-y-scroll py-8 gap-2">
        <div className="px-4">
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
          <p>Last updated: January 25th, 2025</p>
          <br />
          <p>
            This Privacy Policy describes Our policies and procedures on the collection, use, and disclosure of Your information when You use the Service and tells You about Your privacy rights and how the law protects You.
          </p>
          <h2 className="text-xl font-semibold mt-4">Collecting and Using Your Personal Data</h2>
          <h3 className="text-lg font-semibold mt-2">Types of Data Collected</h3>
          <h4 className="text-md font-semibold mt-2">Personal Data</h4>
          <p>
            While using Our Service, We may ask You to provide Us with certain personally identifiable information that can be used to contact or identify You. Personally identifiable information may include, but is not limited to:
          </p>
          <ul className="list-disc list-inside">
            <li>Email address</li>
            <li>Username</li>
            <li>Usage Data</li>
          </ul>
          <h4 className="text-md font-semibold mt-2">Usage Data</h4>
          <p>
            Usage Data is collected automatically when using the Service.
          </p>
          <p>
            Usage Data may include information such as Your Device&lsquo;s Internet Protocol address (e.g. IP address), browser type, browser version, the pages of our Service that You visit, the time and date of Your visit, the time spent on those pages, unique device identifiers, and other diagnostic data.
          </p>
          <h3 className="text-lg font-semibold mt-2">Tracking Technologies and Cookies</h3>
          <p>
            We use Cookies and similar tracking technologies to track the activity on Our Service and store certain information. Tracking technologies used are beacons, tags, and scripts to collect and track information and to improve and analyze Our Service.
          </p>
          <p>
            You can instruct Your browser to refuse all Cookies or to indicate when a Cookie is being sent. However, if You do not accept Cookies, You may not be able to use some parts of our Service.
          </p>
          <br />
          <p>We use Google Analytics to analyze the use of our website. Google Analytics gathers information about website use by means of cookies. The information gathered relating to our website is used to create reports about the use of our website. Google’s privacy policy is available at: https://www.google.com/policies/privacy/</p>
          <h2 className="text-xl font-semibold mt-4">Use of Your Personal Data</h2>
          <p>The Company may use Personal Data for the following purposes:</p>
          <ul className="list-disc list-inside">
            <li>
              <strong>To provide and maintain our Service</strong>, including to monitor the usage of our Service.
            </li>
            <li>
              <strong>To manage Your Account:</strong> to manage Your registration as a user of the Service. The Personal Data You provide can give You access to different functionalities of the Service that are available to You as a registered user.
            </li>
            <li>
              <strong>For the performance of a contract:</strong> the development, compliance, and undertaking of the purchase contract for the products, items, or services You have purchased or of any other contract with Us through the Service.
            </li>
            <li>
              <strong>To manage Your requests:</strong> To attend and manage Your requests to Us.
            </li>
          </ul>
          <h2 className="text-xl font-semibold mt-4">Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy, You can contact us:
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

export default PrivacyPolicy;