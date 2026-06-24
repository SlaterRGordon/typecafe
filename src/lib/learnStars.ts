export interface LearnRequirement {
    wpm: number
    accuracy: number
}

export interface LearnAttempt {
    netWpm: number
}

export interface LearnStarCriteria {
    oneStarNetWpm: number
    twoStarNetWpm: number
    threeStarNetWpm: number
}

export function learnStarCriteria(requirement: LearnRequirement): LearnStarCriteria {
    return {
        oneStarNetWpm: requirement.wpm,
        twoStarNetWpm: requirement.wpm * 1.15,
        threeStarNetWpm: requirement.wpm * 1.3,
    }
}

export function starsFor(attempt: LearnAttempt, requirement: LearnRequirement): 0 | 1 | 2 | 3 {
    const criteria = learnStarCriteria(requirement)

    if (attempt.netWpm >= criteria.threeStarNetWpm) return 3
    if (attempt.netWpm >= criteria.twoStarNetWpm) return 2
    if (attempt.netWpm >= criteria.oneStarNetWpm) return 1

    return 0
}
