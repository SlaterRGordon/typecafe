import { type NextPage } from "next";

const UserDelete: NextPage = () => {

  return (
    <div id="userDelete" className="block w-full h-full justify-center overflow-scroll">
      <h2>Delete Your Profile</h2>
      <p>To delete your profile, please follow these steps:</p>
      <ol>
        <li>Navigate to your profile page.</li>
        <li>Click on the 'Edit Profile' button.</li>
        <li>Press the 'Delete Profile' button located in the top right of the modal.</li>
      </ol>
      <p>Please note that this action is irreversible.</p>
    </div>
  );
};

export default UserDelete;
