import { Typography } from "@mui/material";
import { type NextPage } from "next";
import { useSession } from "next-auth/react";
import { Avatar } from "~/components/Avatar";
import { Activity } from "~/components/profile/activity/Activity";
import Scores from "~/components/scores/Scores";
import { TestModes, TestSubModes } from "~/components/typer/types";

const Profile: NextPage = () => {
  const { data: sessionData } = useSession();

  return (
    <>
      <div className="flex flex-col self-start items-center w-2/12 gap-4 m-8">
        <Avatar size={"12rem"} />
        <Typography variant="h4">{sessionData?.user.name}</Typography>
        <Activity />
      </div>
      <div className="flex flex-col w-full h-full justify-center items-center w-10/12 gap-4">
        <div className="flex flex-col overflow-x-auto overflow-y-hidden w-full px-4 py-8 gap-2">
          <Scores byUser={true} mode={TestModes.normal} subMode={TestSubModes.timed} count={15} date={undefined} />
        </div>
      </div>
    </>
  );
};

export default Profile;
