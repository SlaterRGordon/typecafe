export interface LearnRequirement {
    wpm: number
    accuracy: number
}

export interface LearnAttempt {
    netWpm: number
    accuracy: number
}

export interface LearnStarCriteria {
    oneStarNetWpm: number
    twoStarNetWpm: number
    threeStarNetWpm: number
    oneStarAccuracy: number
    twoStarAccuracy: number
    threeStarAccuracy: number
}

export function learnStarCriteria(requirement: LearnRequirement): LearnStarCriteria {
    return {
        oneStarNetWpm: requirement.wpm,
        twoStarNetWpm: requirement.wpm * 1.15,
        threeStarNetWpm: requirement.wpm * 1.3,
        oneStarAccuracy: requirement.accuracy,
        twoStarAccuracy: requirement.accuracy,
        threeStarAccuracy: Math.max(requirement.accuracy, 97),
    }
}

export function starsFor(attempt: LearnAttempt, requirement: LearnRequirement): 0 | 1 | 2 | 3 {
    const criteria = learnStarCriteria(requirement)

    if (attempt.netWpm >= criteria.threeStarNetWpm && attempt.accuracy >= criteria.threeStarAccuracy) return 3
    if (attempt.netWpm >= criteria.twoStarNetWpm && attempt.accuracy >= criteria.twoStarAccuracy) return 2
    if (attempt.netWpm >= criteria.oneStarNetWpm && attempt.accuracy >= criteria.oneStarAccuracy) return 1

    return 0
}
