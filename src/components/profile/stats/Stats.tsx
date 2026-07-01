import { useState } from "react"
import { api } from "~/utils/api"
import { formatTypedDuration, formatValue } from "./utils"

interface StatsProps {
    profile: {
        username: string | null;
        bio: string | null;
        link: string | null;
        id: string;
        image: string | null;
    } | null | undefined,
}

function StatTile(props: { icon: string; label: string; tone: "primary" | "secondary" | "accent"; value: string; loading?: boolean }) {
    const toneClasses = {
        primary: "text-primary",
        secondary: "text-secondary",
        accent: "text-accent",
    }[props.tone]

    return (
        <div className="flex min-h-[7rem] items-center gap-4 rounded-lg border border-base-content/10 bg-base-200/45 px-5 py-4">
            {props.loading ?
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border border-solid border-t-transparent text-primary" />
                :
                <>
                    <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-base-content/10 bg-base-content/10 text-2xl ${toneClasses}`}>
                        <i className={`fa-solid ${props.icon}`} aria-hidden="true" />
                    </div>
                    <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-mono text-4xl font-bold leading-none text-base-content sm:text-5xl">{props.value}</span>
                        <div className="text-sm font-semibold text-base-content/60">{props.label}</div>
                    </div>
                </>
            }
        </div>
    )
}

export const Stats = (props: StatsProps) => {
    const { profile } = props
    // fetch types
    const { data: wordTypes, isLoading: isLoadingWordsType } = api.type.getAll.useQuery({ subMode: 1 })
    const { data: wordsTyped, isLoading: isLoadingWords } = api.test.getTimeTyped.useQuery({
        typeIds: wordTypes ? wordTypes.map(type => { return type.id; }) : [],
        userId: profile?.id
    })

    const { data: timeTypes, isLoading: isLoadingTimeType } = api.type.getAll.useQuery({ subMode: 0 })
    const { data: timeTyped, isLoading: isLoadingTime } = api.test.getTimeTyped.useQuery({
        typeIds: timeTypes ? timeTypes.map(type => { return type.id; }) : [],
        userId: profile?.id
    })

    const [startDate] = useState(() => new Date(new Date().getFullYear(), 0, 1))
    const [endDate] = useState(() => new Date())
    const { data: yearlyActivity, isLoading: isLoadingActivity } = api.test.getActivityByDate.useQuery({
        startDate,
        endDate,
        userId: profile?.id
    })
    const testsThisYear = yearlyActivity?.reduce((total, day) => total + day._count._all, 0) ?? 0
    const typedDuration = formatTypedDuration(timeTyped?._sum.count)

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile
                icon="fa-clock"
                label={typedDuration.label}
                tone="primary"
                value={typedDuration.value}
                loading={isLoadingTime || isLoadingTimeType}
            />
            <StatTile
                icon="fa-file-lines"
                label="Words typed"
                tone="secondary"
                value={wordsTyped?._sum?.count != null ? formatValue(wordsTyped._sum.count) : "0"}
                loading={isLoadingWords || isLoadingWordsType}
            />
            <StatTile
                icon="fa-bullseye"
                label="Tests this year"
                tone="accent"
                value={formatValue(testsThisYear)}
                loading={isLoadingActivity}
            />
        </div>
    )
}
