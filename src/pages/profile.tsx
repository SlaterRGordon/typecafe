import { type NextPage } from "next";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { Avatar } from "~/components/Avatar";
import { Activity } from "~/components/profile/activity/Activity";

const Profile: NextPage = () => {
  const { data: sessionData } = useSession();

  return (
    <>
      <div className="avatar placeholder"><Avatar size={300} /></div>
      <Activity />
    </>
  );
};

export default Profile;
