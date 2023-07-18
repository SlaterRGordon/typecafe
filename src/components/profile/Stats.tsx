export const Stats = () => {

    return (
        <div className="flex gap-4">
            <div className="flex flex-col lg:flex-row 2xl:flex-col gap-4">
                <div className="flex flex-col py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Total Time Typed</div>
                    <div className="stat-value text-secondary">50.6K</div>
                </div>
                <div className="flex flex-col py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Total Words Typed</div>
                    <div className="stat-value text-secondary">2.6K</div>
                </div>
            </div>
            <div className="flex flex-col lg:flex-row 2xl:flex-col gap-4">
                <div className="flex flex-col py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Top Score</div>
                    <div className="stat-value text-primary">125.12</div>
                </div>
                <div className="flex flex-col py-4 px-6 rounded-md bg-b2">
                    <div className="stat-title">Percentile</div>
                    <div className="stat-value text-primary">98%</div>
                </div>
            </div>
        </div>
    )
}