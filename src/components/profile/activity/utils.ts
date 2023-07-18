import type { Prisma } from "@prisma/client";
import type { Activity as CalendarActivity, Level } from "react-activity-calendar"

export const getActivityData = (activity: (Prisma.PickArray<Prisma.TestGroupByOutputType, "summaryDate"[]> & {
    _count: {
        _all: number;
    };
})[] | undefined) => {
    const date = new Date()
    date.setDate(date.getDate() - 365)

    const data: CalendarActivity[] = []
    for (let i = 0; i < 365; i++) {
        const found = activity?.find((item) => item.summaryDate.toISOString().split("T")[0] as string === date.toISOString().split("T")[0] as string)
        date.setDate(date.getDate() + 1)
        if (!found) {
            data.push({
                count: 0,
                date: date.toISOString().split("T")[0] as string,
                level: 0,
            })
        } else {
            let level = 0;
            if (found._count._all > 6) {
                level = 4;
            } else if (found._count._all > 4) {
                level = 3;
            } else if (found._count._all > 2) {
                level = 2;
            } else if (found._count._all > 0) {
                level = 1;
            }

            data.push({
                count: found._count._all,
                date: date.toISOString().split("T")[0] as string,
                level: level as Level,
            })
        }
    }

    console.log(data)
    
    return data;
}