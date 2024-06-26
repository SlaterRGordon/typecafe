
import { useEffect, useState, useRef, useCallback } from "react"
import ActivityCalendar from "react-activity-calendar"
import type { Activity as CalendarActivity, ThemeInput, ColorScale } from "react-activity-calendar"
import { api } from "~/utils/api"
import { getActivityData } from "./utils"

const useMutationObserver = (domNodeSelector: string, observerOptions: MutationObserverInit | undefined, cb: MutationCallback) => {
  useEffect(() => {
    const targetNode = document.querySelector(domNodeSelector);

    const observer = new MutationObserver(cb);

    observer.observe(targetNode as Node, observerOptions);

    return () => {
      observer.disconnect();
    };
  }, [domNodeSelector, observerOptions, cb]);
}

const options = { attributes: true };

const useStyle = () => {
  const [style, setStyle] = useState<string | undefined>("");

  useEffect(() => {
    setStyle(document.documentElement.style.getPropertyValue('--p'));
  }, []);

  const handler = useCallback((mutationList: MutationRecord[]) => {
    mutationList.forEach(mutation => {
      if (mutation.type !== 'attributes' || mutation.attributeName !== 'style') return;

      setStyle(document.documentElement.style.getPropertyValue('--p'));
    });
  }, []);

  useMutationObserver('html', options, handler);

  return style; // locale[lang]
};

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