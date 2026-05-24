
import { useEffect, useMemo, useState } from "react"
import { ActivityCalendar } from "react-activity-calendar"
import type { Activity as CalendarActivity } from "react-activity-calendar"
import { api } from "~/utils/api"
import { getActivityData } from "./utils"
import { useStyle } from "~/utils/hooks/useMutationObserver"

interface ActivityProps {
  profile: {
    username: string | null;
    bio: string | null;
    link: string | null;
    id: string;
    image: string | null;
  } | null | undefined,
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
    const emptyColor = primary ? `hsla(${primary.split(" ").join(",")},0.2)` : "hsl(0, 0%, 22%)"
    const activeColor = primary ? `hsla(${primary.split(" ").join(",")},1)` : "rebeccapurple"

    return {
      light: [emptyColor, activeColor],
      dark: [emptyColor, activeColor],
    }
  }, [style])

  const { data: testCounts } = api.test.getActivityByDate.useQuery({
    startDate,
    endDate,
    userId: profile?.id
  })

  useEffect(() => {
    setData(getActivityData(testCounts))
    let total = 0
    testCounts?.forEach((testCount) => {
      total += testCount._count._all
    })
    setTotalCount(total)
  }, [testCounts])

  return (
    <ActivityCalendar
      data={data}
      theme={activityTheme}
      showMonthLabels={true}
      showWeekdayLabels={false}
      showColorLegend={true}
      showTotalCount={true}
      blockSize={12}
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
          'Sun',
          'Mon',
          'Tue',
          'Wed',
          'Thu',
          'Fri',
          'Sat'
        ]
      }}
    />
  )
}
