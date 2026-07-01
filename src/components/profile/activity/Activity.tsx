import { useEffect, useMemo, useState } from "react"
import { ActivityCalendar } from "react-activity-calendar"
import type { Activity as CalendarActivity } from "react-activity-calendar"
import { api } from "~/utils/api"
import { getActivityData } from "./utils"
import { useStyle } from "~/utils/hooks/useMutationObserver"
import { longestStreak } from "~/lib/progress"
import { Chip } from "~/components/ui/Chip"
import type { RouterOutputs } from "~/utils/api"

export type ProfileActivityData = RouterOutputs["test"]["getActivityByDate"]

interface ActivityProps {
  profile: {
    username: string | null;
    bio: string | null;
    link: string | null;
    id: string;
    image: string | null;
  } | null | undefined,
  data?: ProfileActivityData,
}

export const Activity = (props: ActivityProps) => {
  const { profile } = props

  const date = new Date()
  const [totalCount, setTotalCount] = useState(0)
  date.setDate(date.getDate() - 365)
  const [startDate] = useState(date)
  const [endDate] = useState(new Date())
  const [data, setData] = useState<CalendarActivity[]>(() => getActivityData(undefined))
  const style = useStyle();
  const activityTheme = useMemo(() => {
    const primary = style?.trim()
    const emptyColor = primary ? `hsla(${primary.split(" ").join(",")},0.32)` : "hsl(0, 0%, 22%)"
    const activeColor = primary ? `hsla(${primary.split(" ").join(",")},1)` : "rebeccapurple"

    return {
      light: [emptyColor, activeColor],
      dark: [emptyColor, activeColor],
    }
  }, [style])

  const { data: fetchedTestCounts } = api.test.getActivityByDate.useQuery({
    startDate,
    endDate,
    userId: profile?.id
  }, { enabled: !props.data })
  const testCounts = props.data ?? fetchedTestCounts

  useEffect(() => {
    setData(getActivityData(testCounts))
    let total = 0
    testCounts?.forEach((testCount) => {
      total += testCount._count._all
    })
    setTotalCount(total)
  }, [testCounts])

  const bestStreak = useMemo(() => {
    return longestStreak((testCounts ?? []).map((testCount) => ({
      createdAt: testCount.summaryDate,
      day: testCount.summaryDate.toISOString().slice(0, 10),
    })))
  }, [testCounts])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-start items-center gap-4">
        <h2 className="text-base font-bold">Activity</h2>
        <Chip
          testId="profile-longest-streak"
          tone="primary"
          size="md"
          icon={<i className="fa-solid fa-calendar-days" aria-hidden="true" />}
        >
          Longest streak: {bestStreak} {bestStreak === 1 ? "day" : "days"}
        </Chip>
      </div>
      <div data-testid="profile-activity-surface" className="min-w-0 overflow-hidden pb-1">
        <div className="flex justify-center">
          <div className="flex items-center w-full min-w-0 flex-col gap-4">
            <ActivityCalendar
              data={data}
              theme={activityTheme}
              colorScheme="dark"
              showMonthLabels={true}
              showWeekdayLabels={true}
              showColorLegend={true}
              showTotalCount={true}
              blockSize={18}
              blockMargin={3}
              blockRadius={20}
              fontSize={12}
              labels={{
                months: [
                  'Jan',
                  'Feb',
                  'Mar',
                  'Apr',
                  'May',
                  'Jun',
                  'Jul',
                  'Aug',
                  'Sep',
                  'Oct',
                  'Nov',
                  'Dec'
                ],
                totalCount: `${totalCount} tests in ${new Date().getFullYear()}`,
                weekdays: [
                  'S',
                  'M',
                  'T',
                  'W',
                  'T',
                  'F',
                  'S'
                ]
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
