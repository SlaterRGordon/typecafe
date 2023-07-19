import { Typography } from "@mui/material";
import { type NextPage } from "next";
import { useSession } from "next-auth/react";
import { Avatar } from "~/components/Avatar";
import { Stats } from "~/components/profile/stats/Stats";
import { Activity } from "~/components/profile/activity/Activity";
import Scores from "~/components/scores/Scores";
import { TestModes, TestSubModes } from "~/components/typer/types";
import Select, { SingleValue } from 'react-select'
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Image from "next/image";

type Option = { label: string, value: number | string }

const Profile: NextPage = () => {
  const router = useRouter()
  const { data: sessionData, status } = useSession();
  const [language, setLanguage] = useState<string>("english")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [timeRange, setTimeRange] = useState(3)
  const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
  const [count, setCount] = useState(15)

  const languageOptions = [
    { value: "english", label: 'English' },
    { value: "french", label: 'French' },
    { value: "Hindi", label: 'Hindi' },
    { value: "Chinese", label: 'Chinese' },
    { value: "Spanish", label: 'Spanish' },
  ]
  const handleChangeLanguage = (value: SingleValue<Option>) => {
    if (value) {
      setLanguage(value.value as string)
    }
  }

  const timeRangeOptions = [
    { value: 0, label: 'Daily' },
    { value: 1, label: 'Weekly' },
    { value: 2, label: 'Monthly' },
    { value: 3, label: 'All Time' },
  ]
  const handleChangeTimeRange = (value: SingleValue<Option>) => {
    if (value) {
      setTimeRange(value.value as number)
    }
  }

  useEffect(() => {
    const today = new Date()
    switch (timeRange) {
      case 0:
        today.setDate(today.getDate() - 1)
        setDate(today)
        break;
      case 1:
        today.setDate(today.getDate() - 7)
        setDate(today)
        break;
      case 2:
        today.setDate(today.getDate() - 30)
        setDate(today)
        break;
      case 3:
        setDate(undefined)
        break;
    }
  }, [timeRange])

  const subModeOptions = [
    { value: TestSubModes.timed, label: 'Timed' },
    { value: TestSubModes.words, label: 'Words' },
  ]

  const timedCountOptions = [
    { value: 15, label: '15' },
    { value: 30, label: '30' },
    { value: 60, label: '60' },
    { value: 120, label: '120' },

  ]
  const handleChangeSubMode = (value: SingleValue<Option>) => {
    if (value) {
      if (value.value == TestSubModes.timed) setCount(15)
      else setCount(10)

      setSubMode(value.value as number)
    }
  }

  const wordsCountOptions = [
    { value: 10, label: '10' },
    { value: 25, label: '25' },
    { value: 50, label: '50' },
    { value: 100, label: '100' },
  ]
  const handleChangeCount = (value: SingleValue<Option>) => {
    if (value) setCount(value.value as number)
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
        .catch(err => console.log(err))
    }
  }, [status, router])

  console.log(status)
  if (status === "loading") return <div className="loading-spinner"></div>;
  else if (status === "unauthenticated") return <div className="loading-spinner"></div>;

  return (
    <>
      <div className="flex flex-col w-full h-full overflow-auto overflow-x-hidden my-4 items-center">
        <div className="flex w-10/12 md:max-w-7xl mt-8 mx-4">
          <div className="flex flex-col items-center justify-center mx-6">
            <div className="avatar">
              <div className="mask mask-circle w-24 h-24">
                <Image width={500} height={500} src={sessionData?.user.image ?? ""} alt="" />
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-center gap-1">
            <p className="text-sm md:text-xl"><strong>{sessionData?.user.name}</strong></p>
            <p className="text-xs md:text-lg">Owner of type.cafe</p>
            <p className="cursor-pointer text-xs md:text-lg"><a href="http://github.com/SlaterRGordon">http://github.com/SlaterRGordon</a></p>
          </div>
        </div>
        <div className="divider mb-4 mx-8 mt-3"></div>
        <div className="flex w-10/12">
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
            <div className="flex flex-col overflow-x-auto h-[60vh] overflow-y-hidden w-full px-4 py-4 gap-2">
              <Typography variant="h5" className="my-2"><strong>Best Scores</strong></Typography>
              <div className="flex gap-2">
                <Select
                  instanceId="languageSeelect"
                  defaultValue={languageOptions[0]}
                  options={languageOptions}
                  value={languageOptions.find(option => option.value == language)}
                  onChange={handleChangeLanguage}
                  isSearchable={false}
                  className="max-w-xs my-react-select-container"
                  classNamePrefix="my-react-select"
                />
                <Select
                  instanceId="subModeSelect"
                  defaultValue={subModeOptions[0]}
                  options={subModeOptions}
                  value={subModeOptions[subMode]}
                  onChange={handleChangeSubMode}
                  isSearchable={false}
                  className="max-w-xs my-react-select-container"
                  classNamePrefix="my-react-select"
                />
                <Select
                  instanceId="countSelect"
                  defaultValue={subMode == TestSubModes.timed ? timedCountOptions[0] : wordsCountOptions[0]}
                  options={subMode == TestSubModes.timed ? timedCountOptions : wordsCountOptions}
                  value={
                    subMode == TestSubModes.timed ?
                      timedCountOptions.find(option => option.value == count) :
                      wordsCountOptions.find(option => option.value == count)
                  }
                  onChange={handleChangeCount}
                  isSearchable={false}
                  className="max-w-xs my-react-select-container"
                  classNamePrefix="my-react-select"
                />
                <Select
                  instanceId="timeRangeSelect"
                  defaultValue={timeRangeOptions[0]}
                  options={timeRangeOptions}
                  value={timeRangeOptions[timeRange]}
                  onChange={handleChangeTimeRange}
                  isSearchable={false}
                  className="max-w-xs my-react-select-container"
                  classNamePrefix="my-react-select"
                />
              </div>
              <Scores byUser={true} mode={TestModes.normal} subMode={subMode} count={count} date={date} language={language} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Profile;
