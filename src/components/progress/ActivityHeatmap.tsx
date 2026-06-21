import { useMemo } from "react"
import { ActivityCalendar } from "react-activity-calendar"
import { useStyle } from "~/utils/hooks/useMutationObserver"
import { buildActivityCalendar } from "~/lib/activity"

// The yearly test-activity calendar, fed by the progress records already loaded
// (per-day test counts) rather than its own query — so it works for guests too.
// Colours track the active theme's primary like the profile calendar did.
export function ActivityHeatmap(props: { timestamps: number[] }) {
    const style = useStyle()
    const theme = useMemo(() => {
        const primary = style?.trim()
        const emptyColor = primary ? `hsla(${primary.split(" ").join(",")},0.2)` : "hsl(0, 0%, 22%)"
        const activeColor = primary ? `hsla(${primary.split(" ").join(",")},1)` : "rebeccapurple"
        return { light: [emptyColor, activeColor], dark: [emptyColor, activeColor] }
    }, [style])

    const { data, total } = useMemo(() => buildActivityCalendar(props.timestamps, new Date()), [props.timestamps])

    return (
        <div data-testid="activity-heatmap" className="flex w-full justify-center overflow-x-auto pb-1">
            <ActivityCalendar
                data={data}
                theme={theme}
                showMonthLabels
                showWeekdayLabels={false}
                showColorLegend
                showTotalCount
                blockSize={12}
                labels={{ totalCount: `${total} ${total === 1 ? "test" : "tests"} in the last year` }}
            />
        </div>
    )
}
