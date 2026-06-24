import { type NextPage } from "next";
import { signOut, useSession } from "next-auth/react";
import { Stats } from "~/components/profile/stats/Stats";
import { Activity } from "~/components/profile/activity/Activity";
import Scores from "~/components/scores/Scores";
import { TestModes, TestSubModes } from "~/components/typer/types";
import Select from 'react-select'
import type { SingleValue } from 'react-select'
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Avatar } from "~/components/Avatar";
import { Modal } from "~/components/Modal";
import { Edit } from "~/components/profile/edit/Edit";
import { api } from "~/utils/api";
import { ConfirmModal } from "~/components/ConfirmModal";
import { currentStreak } from "~/lib/progress";

type Option = { label: string, value: number | string }

const Profile: NextPage = () => {
  const router = useRouter()
  const { data: sessionData, status } = useSession();
  const [language, setLanguage] = useState<string>("english")
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [timeRange, setTimeRange] = useState(3)
  const [subMode, setSubMode] = useState<TestSubModes>(TestSubModes.timed)
  const [count, setCount] = useState(15)
  const [update, setUpdate] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data: userData, refetch: refetchUserData, isLoading } = api.user.get.useQuery()

  // Practice-day streak from the last ~90 days of activity (§3.2). The range is
  // memoized so the query key stays stable across renders (inline `new Date()`
  // would churn the key and never settle).
  const streakRange = useState(() => ({
    startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    endDate: new Date(),
  }))[0]
  const { data: activity } = api.test.getActivityByDate.useQuery(streakRange)
  const streak = currentStreak(
    (activity ?? []).map((day) => ({ wpm: 0, accuracy: 0, createdAt: day.summaryDate })),
    streakRange.endDate,
  )

  const onModalClose = async () => {
    setUpdate(prevUpdate => !prevUpdate)

    const input = document.getElementById("configModal") as HTMLInputElement
    if (input) input.checked = false

    await refetchUserData()
  }

  const onConfirmModalClose = () => {
    const input = document.getElementById("confirmModal") as HTMLInputElement
    if (input) {
      if (!input.checked) input.checked = true
      else input.checked = false
    }
  }

  const languageOptions = [
    { value: "english", label: 'English' },
    { value: "french", label: 'French' },
    { value: "spanish", label: 'Spanish' },
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


  // delete user
  const deleteUser = api.user.delete.useMutation({
    onSuccess: () => {
      setDeleting(false)
      void signOut()
      void router.push("/")

    },
    onError: (error) => {
      console.log(error)
      setDeleting(false)
    }
  })

  const deleteProfile = (result: boolean) => {
    if (result) {
      setDeleting(true)
      deleteUser.mutate()
    } else {
      setDeleting(false)
    }
    onConfirmModalClose()
  }

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/")
        .catch(err => console.log(err))
    }
  }, [status, router])

  if (status === "loading") return <div className="loading-spinner"></div>;
  else if (status === "unauthenticated") return <div className="loading-spinner"></div>;

  return (
    <>
      <div className="flex justify-stretch flex-col w-full h-full overflow-auto overflow-x-hidden items-center">
        <div className="flex w-11/12 space-x-4 mt-8 mx-4">
          <div className="flex flex-col gap-2">
            <div className="flex gap-4">
              <div data-testid="profile-avatar" className="flex flex-col items-center justify-center">
                <Avatar
                  size={96}
                  image={userData ? userData.image : sessionData?.user.image}
                  name={userData?.username ?? sessionData?.user.username ?? sessionData?.user.name}
                />
              </div>
              <div className="flex flex-col justify-center gap-1">
                {isLoading ?
                  <div className="flex basis-0 grow items-center">
                    <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                  </div>
                  :
                  <>
                    <div className="flex items-center gap-2">
                      <p className="text-sm md:text-xl"><strong>{userData?.username ?? ""}</strong></p>
                      {streak > 0 &&
                        <span data-testid="profile-streak" className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-primary md:text-sm">{streak}-day streak</span>
                      }
                    </div>
                    <p className="text-xs md:text-lg">{userData?.bio ?? ""}</p>
                    <p className="cursor-pointer text-xs md:text-lg"><a href={userData?.link ?? ""}>{userData?.link ?? ""}</a></p>
                  </>
                }
              </div>
            </div>
            <label className="btn btn-secondary btn-sm w-full my-[0.2rem]" htmlFor="configModal">Edit Profile</label>
          </div>
        </div>
        <div className="divider mb-4 mx-8 mt-3"></div>
        <div className="flex basis-0 grow items-stretch w-11/12">
          <div className="flex basis-0 grow justify-stretch flex-col 2xl:items-center w-full">
            <div className="flex w-full gap-4 flex-col">
              <div className="flex flex-col">
                <h2 className="my-2 text-2xl font-bold">Stats</h2>
                <Stats profile={null} />
              </div>
              <div className="hidden flex-col md:flex">
                <h2 className="my-2 text-2xl font-bold">Activity</h2>
                <Activity profile={null} />
              </div>
            </div>
            <div className="flex basis-0 grow justify-stretch flex-col overflow-x-auto overflow-y-auto min-h-[532px] w-full py-4 gap-2">
              <h2 className="my-2 text-2xl font-bold">Best Scores</h2>
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
              <Scores update={update} userId={sessionData?.user.id} mode={TestModes.normal} subMode={subMode} count={count} date={date} language={language} />
            </div>
          </div>
        </div>
      </div>
      <Modal boxClassName="sm:w-[500px] !max-h-[82vh] sm:!max-h-[calc(100vh-5em)]">
        <Edit userData={userData} onClose={onModalClose} openConfirmModal={onConfirmModalClose} />
      </Modal>
      <ConfirmModal loading={deleting} message="Are you sure you want to delete your account?" callback={(result) => deleteProfile(result)} />
    </>
  );
};

export default Profile;
