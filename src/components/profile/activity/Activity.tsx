
import { useEffect, useState } from "react"
import ActivityCalendar from "react-activity-calendar"
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
  const [data, setData] = useState<CalendarActivity[]>([])
  const style = useStyle();

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
      theme={{
        light: [style ? `hsla(${style.split(" ").join(",")},0.2)` : "hsl(0, 0%, 92%)", style ? `hsla(${style.split(" ").join(",")},1)` : 'rebeccapurple'],
      }}
      hideMonthLabels={false}
      showWeekdayLabels={false}
      hideColorLegend={false}
      hideTotalCount={false}
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
