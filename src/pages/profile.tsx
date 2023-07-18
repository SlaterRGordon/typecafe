import { Typography } from "@mui/material";
import { type NextPage } from "next";
import { useSession } from "next-auth/react";
import { Avatar } from "~/components/Avatar";
import { Stats } from "~/components/profile/stats/Stats";
import { Activity } from "~/components/profile/activity/Activity";
import Scores from "~/components/scores/Scores";
import { TestModes, TestSubModes } from "~/components/typer/types";

const Profile: NextPage = () => {
  const { data: sessionData } = useSession();

  return (
    <>
      <div className="flex flex-col w-full md:w-10/12 h-full overflow-auto overflow-x-hidden md:overflow-hidden my-4">
        <div className="flex w-full md:max-w-7xl mt-8">
          <div className="flex flex-col items-center justify-center mx-6">
            <Avatar size={"10rem"} />
          </div>
          <div className="flex flex-col justify-center gap-1">
            <Typography variant="h4" className="text-base sm:text-lg md:text-xl"><strong>{sessionData?.user.name}</strong></Typography>
            <Typography variant="h5" className="text-sm sm:text-base md:text-lg">Owner of type.cafe</Typography>
            <Typography variant="h5" className="cursor-pointer text-sm sm:text-base md:text-lg"><a href="http://github.com/SlaterRGordon">http://github.com/SlaterRGordon</a></Typography>
          </div>
        </div>
        <div className="divider mb-8 mx-8 mt-3"></div>
        <div className="flex w-full">
          <div className="flex flex-col 2xl:items-center w-full">
            <div className="flex w-full 2xl:items-center gap-4 2xl:gap-12 px-4 flex-col 2xl:flex-row">
              <div className="flex flex-col">
                <Stats />
              </div>
              <div className="hidden flex-col md:flex">
                <Typography variant="h5" className="my-2"><strong>Activity</strong></Typography>
                <Activity />
              </div>
            </div>
            <div className="flex flex-col overflow-x-auto h-[60vh] overflow-y-hidden w-full px-4 py-8 gap-2">
              <Typography variant="h5" className="my-2"><strong>Best Scores</strong></Typography>
              <Scores byUser={true} mode={TestModes.normal} subMode={TestSubModes.timed} count={15} date={undefined} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Profile;
