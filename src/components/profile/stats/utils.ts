export const formatValue = (value: number) => {
    if (value > 1000000) {
        return `${(value / 1000000).toFixed(2)}M`;
    } else if (value > 1000) {
        return `${(value / 1000).toFixed(2)}K`;
    } else {
        return value;
    }
}

export const formatPercentile = (value: number, better: number, worse: number) => {
    if (better < 1000) {
        return `#${better + 1}`;
    } else {
        return `${(better / (better + worse) * 100).toFixed(2)}%`;
    }
}