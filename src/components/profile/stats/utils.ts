import { formatStat } from "~/lib/format"

export const formatValue = (value: number) => {
    if (value > 1000000) {
        return `${formatStat(value / 1000000)}M`;
    } else if (value > 1000) {
        return `${formatStat(value / 1000)}K`;
    } else {
        return formatStat(value);
    }
}

export const formatPercentile = (value: number, better: number, worse: number) => {
    if (better < 1000) {
        if (better + 1 < 20) {
            if (better + 1 == 1) return '1st place';
            else if (better + 1 == 2) return '2nd place';
            else if (better + 1 == 3) return '3rd place';
            else return `${better + 1}th place`;
        } 
        else if ((better + 1).toString().endsWith('1')) return `${better + 1}st place`;
        else if ((better + 1).toString().endsWith('2')) return `${better + 1}nd place`;
        else if ((better + 1).toString().endsWith('3')) return `${better + 1}rd place`;
        else return `${better + 1}th place`;
    } else {
        return `top ${(better / (better + worse) * 100).toFixed(2)}%`;
    }
}