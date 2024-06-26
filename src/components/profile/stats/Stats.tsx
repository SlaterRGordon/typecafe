import { useEffect } from "react"
import { api } from "~/utils/api"
import { formatPercentile, formatValue } from "./utils"

interface StatsProps {
    profile: {
        username: string | null;
        bio: string | null;
        link: string | null;
        id: string;
        image: string | null;
    } | null | undefined,
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

    const { data: bestScore, isLoading: isLoadingScore } = api.test.getBestScore.useQuery({ userId: profile?.id })
    const { data: percentile, isLoading: isLoadingPercentile } = api.test.getPercentile.useQuery({ userId: profile?.id })

    return (
        <div className="flex gap-4">
            <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex items-center py-4 px-4 rounded-md bg-b2">
                    <div className="flex flex-col">
                        <div className="stat-title">Time Typing</div>
                        {isLoadingTime || isLoadingTimeType ?
                            <div className="flex basis-0 grow items-center">
                                <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                            </div>
                            :
                            <div className="stat-value text-secondary text-[1.5rem] sm:text-[2.25rem]">{timeTyped?._sum.count ? formatValue(timeTyped._sum.count / 60) : 0.00} mins</div>
                        }
                    </div>
                </div>
                <div className="flex items-center py-4 px-4 rounded-md bg-b2">
                    <div className="flex flex-col">
                        <div className="stat-title">Words Typed</div>
                        {isLoadingWords || isLoadingWordsType ?
                            <div className="flex basis-0 grow items-center">
                                <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                            </div>
                            :
                            <div className="stat-value text-secondary text-[1.5rem] sm:text-[2.25rem]">{wordsTyped?._sum?.count != null ? formatValue(wordsTyped._sum.count) : 0} words</div>
                        }
                    </div>
                </div>
            </div>
            <div className="flex gap-4">
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex items-center py-4 px-4 rounded-md bg-b2">
                        <div className="flex flex-col">
                            <div className="stat-title">Top Speed</div>
                            {isLoadingScore ?
                                <div className="flex basis-0 grow items-center">
                                    <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                                </div>
                                :
                                <div className="stat-value text-primary text-[1.5rem] sm:text-[2.25rem]">{bestScore ? bestScore.speed.toFixed(2) : 0.00} wpm</div>
                            }
                        </div>
                    </div>
                    <div className="flex items-center py-4 px-4 rounded-md bg-b2">
                        <div className="flex flex-col">
                            <div className="stat-title">Ranking</div>
                            {isLoadingPercentile ?
                                <div className="flex basis-0 grow items-center">
                                    <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                                </div>
                                :
                                <div className="stat-value text-primary text-[1.5rem] sm:text-[2.25rem]">{percentile ? formatPercentile(percentile.percentile, percentile.better, percentile.worse) : 'N/A'}</div>
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}