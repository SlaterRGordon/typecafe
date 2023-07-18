import { useEffect } from "react"
import { api } from "~/utils/api"
import { formatPercentile, formatValue } from "./utils"

export const Stats = () => {
    // fetch types
    const { data: timeTypes } = api.type.getAll.useQuery({ subMode: 1 })
    const { data: wordTypes } = api.type.getAll.useQuery({ subMode: 0 })
    const { data: wordsTyped } = api.test.getTimeTyped.useQuery({
        typeIds: timeTypes ? timeTypes.map(type => {return type.id;}) : [],
    })
    const { data: timeTyped } = api.test.getTimeTyped.useQuery({
      typeIds: wordTypes ? wordTypes.map(type => {return type.id;}) : [],
    })
    
    const { data: bestScore } = api.test.getBestScore.useQuery()
    const { data: percentile } = api.test.getPercentile.useQuery()

    useEffect(() => {
        console.log(percentile)
    }, [percentile])

    return (
        <div className="flex gap-4">
            <div className="flex flex-col lg:flex-row 2xl:flex-col gap-4">
                <div className="flex flex-col py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Total Time</div>
                    <div className="stat-value text-secondary">{timeTyped?._sum.count ? formatValue(timeTyped._sum.count) : 0}</div>
                </div>
                <div className="flex flex-col py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Total Words</div>
                    <div className="stat-value text-secondary">{wordsTyped?._sum?.count != null ? formatValue(wordsTyped._sum.count) : 0}</div>
                </div>
            </div>
            <div className="flex flex-col lg:flex-row 2xl:flex-col gap-4">
                <div className="flex flex-col py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Top Speed</div>
                    <div className="stat-value text-primary">{bestScore ? bestScore.speed.toFixed(2) : 0.00}</div>
                </div>
                <div className="flex flex-col py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Percentile</div>
                    <div className="stat-value text-primary">{percentile ? formatPercentile(percentile.percentile, percentile.better, percentile.worse) : 'N/A'}</div>
                </div>
            </div>
        </div>
    )
}