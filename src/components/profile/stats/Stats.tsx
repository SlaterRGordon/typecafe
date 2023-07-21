import { useEffect } from "react"
import { api } from "~/utils/api"
import { formatPercentile, formatValue } from "./utils"

export const Stats = () => {
    // fetch types
    const { data: wordTypes, isLoading: isLoadingWordsType } = api.type.getAll.useQuery({ subMode: 1 })
    const { data: wordsTyped, isLoading: isLoadingWords } = api.test.getTimeTyped.useQuery({
        typeIds: wordTypes ? wordTypes.map(type => { return type.id; }) : [],
    })

    const { data: timeTypes, isLoading: isLoadingTimeType } = api.type.getAll.useQuery({ subMode: 0 })
    const { data: timeTyped, isLoading: isLoadingTime } = api.test.getTimeTyped.useQuery({
        typeIds: timeTypes ? timeTypes.map(type => { return type.id; }) : [],
    })

    const { data: bestScore, isLoading: isLoadingScore } = api.test.getBestScore.useQuery()
    const { data: percentile, isLoading: isLoadingPercentile } = api.test.getPercentile.useQuery()

    return (
        <div className="flex gap-4">
            <div className="flex flex-col lg:flex-row 2xl:flex-col gap-4">
                <div className="flex flex-col items-center py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Total Time</div>
                    {isLoadingTime || isLoadingTimeType ?
                        <div className="flex basis-0 grow items-center">
                            <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                        </div>
                        :
                        <div className="stat-value text-secondary">{timeTyped?._sum.count ? formatValue(timeTyped._sum.count) : 0}</div>
                    }
                </div>
                <div className="flex flex-col items-center py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Total Words</div>
                    {isLoadingWords || isLoadingWordsType ?
                        <div className="flex basis-0 grow items-center">
                            <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                        </div>
                        :
                        <div className="stat-value text-secondary">{wordsTyped?._sum?.count != null ? formatValue(wordsTyped._sum.count) : 0}</div>
                    }
                </div>
            </div>
            <div className="flex flex-col lg:flex-row 2xl:flex-col gap-4">
                <div className="flex flex-col items-center py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Top Speed</div>
                    {isLoadingScore ?
                        <div className="flex basis-0 grow items-center">
                            <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                        </div>
                        :
                        <div className="stat-value text-primary">{bestScore ? bestScore.speed.toFixed(2) : 0.00}</div>
                    }
                </div>
                <div className="flex flex-col items-center py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Percentile</div>
                    {isLoadingPercentile ?
                        <div className="flex basis-0 grow items-center">
                            <div className="w-8 h-8 rounded-full animate-spin border border-solid text-primary border-t-transparent"></div>
                        </div>
                        :
                        <div className="stat-value text-primary">{percentile ? formatPercentile(percentile.percentile, percentile.better, percentile.worse) : 'N/A'}</div>
                    }
                </div>
            </div>
        </div>
    )
}