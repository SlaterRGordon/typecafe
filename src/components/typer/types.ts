export enum TestModes {
    normal,
    practice,
    ngrams,
    relaxed
}

export enum TestSubModes {
    timed,
    words
}

export enum TestGramSources {
    bigrams,
    trigrams,
    tetragrams,
    words
}

export enum TestGramScopes {
    fifty = 50,
    oneHundred = 100,
    twoHundred = 200,
}