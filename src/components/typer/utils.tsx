import biGrams from './languages/nGrams/biGrams.json'
import triGrams from './languages/nGrams/triGrams.json'
import tetraGrams from './languages/nGrams/tetraGrams.json'
import pentaGrams from './languages/nGrams/pentaGrams.json'

import english10k from './languages/english10k.json'
import french10k from './languages/french10k.json'
import chinese10k from './languages/chinese10k.json'
import spanish10k from './languages/spanish10k.json'
import hindi1k from './languages/hindi1k.json'

import { TestGramScopes, TestGramSources } from './types'

const languages = {
    english: english10k,
    french: french10k,
    chinese: chinese10k,
    spanish: spanish10k,
    hindi: hindi1k,
}

interface NGrams {
    biGrams: string[],
    triGrams: string[],
    tetraGrams: string[],
    pentaGrams: string[],
}

const ngrams: NGrams = {
    biGrams: biGrams.grams,
    triGrams: triGrams.grams,
    tetraGrams: tetraGrams.grams,
    pentaGrams: pentaGrams.grams,
}

export const generatePseudoText = (count: number, language: string, characters: string[]) => {
    let text = ''
    const frequencies = [0.1944, 0.4166, 0.5888, 0.7000, 0.7833, 0.8592, 0.9142, 0.9558, 0.9835, 1.000]
    const words = languages[language as keyof typeof languages].words
    const filteredWords = words.filter((word: string) => {
        if (!word.includes(characters[characters.length - 1] as string)) return false

        for (let i = 0; i < word.length; i++) {
            if (!characters.includes(word[i] as string)) return false
        }

        return true
    })

    // Generate random text
    for (let i = 0; i < count; i++) {
        const randomDecimal = Math.random()
        for (let j = 0; j < frequencies.length; j++) {
            if (randomDecimal <= (frequencies[j] as number)) {
                const randomIndex = Math.floor(Math.random() * filteredWords.length)
                text = text += (filteredWords[randomIndex] as string) + ' '
                break;
            }
        }
    }

    // Remove last space
    return text.toLowerCase().slice(0, -1)
}

export const generateBetterPseudoText = (count: number, language: string, characters: string[]) => {
    let text = ''

    let allGrams: string[] = []
    Object.keys(ngrams).map((key: string) => {
        allGrams = allGrams.concat(ngrams[key as keyof typeof ngrams])
    })
    
    const filteredGrams = allGrams.filter((gram: string) => {
        if (!gram.includes(characters[characters.length - 1] as string)) return false

        for (let i = 0; i < gram.length; i++) {
            if (!characters.includes(gram[i] as string)) return false
        }

        return true
    })

    // Decide next word length
    const wordLengths = [2, 3, 4, 5, 6, 7, 8, 9, 10]
    const wordLengthFrequencies = [0.2, 0.4, 0.6, 0.75, 0.85, 0.9, 0.95, 0.98, 1.0];

    // Generate random text
    let wordLength = 0
    for (let i = 0; i < count; i++) {
        const randomDecimal = Math.random()
        for (let i = 0; i < wordLengthFrequencies.length; i++) {
            if (randomDecimal <= (wordLengthFrequencies[i] as number)) {
                wordLength = wordLengths[i] as number
                break;
            }
        }

        let newWord = ''
        while(newWord.length !== wordLength) {
            let filteredGramsByLength: string[] = []
            
            if (wordLength === 2) {
                // Add bigram that has a vowel
                filteredGramsByLength = filteredGrams.filter((gram: string) => gram.length === 2 && gram.match(/[aeiou]/g))
            } else if (!newWord.slice(-2).match(/[aeiou]/g)) {
                // Add bigram that has a vowel as its first character
                filteredGramsByLength = filteredGrams.filter((gram: string) => gram.length <= (wordLength - newWord.length) && gram.length != (wordLength - newWord.length - 1) && gram.match(/^[aeiou]/))
            } else if (newWord.length === 0) {
                // Add gram that has a vowel in it
                filteredGramsByLength = filteredGrams.filter((gram: string) => gram.length <= (wordLength - newWord.length) && gram.length != (wordLength - newWord.length - 1) && gram.match(/[aeiou]/g))
            } else {
                filteredGramsByLength = filteredGrams.filter((gram: string) => gram.length <= (wordLength - newWord.length) && gram.length != (wordLength - newWord.length - 1))
            }
            const randomIndex = Math.floor(Math.random() * filteredGramsByLength.length)
            let randomGram = filteredGramsByLength[randomIndex] as string

            newWord += randomGram
        }
        text = text += newWord + ' '
    }

    return text.toLowerCase().slice(0, -1)
}

export const generateText = (count: number, language: string) => {
    let text = ''

    // Generate random text
    const words = languages[language as keyof typeof languages].words
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * words.length)
        const randomWord = String(words[randomIndex])
        text = text += randomWord + ' '
    }

    // Remove last space
    return text.toLowerCase().slice(0, -1)
}

export const generateNGram = (source: TestGramSources, scope: TestGramScopes, combination: number, repetition: number, level: number) => {
    let ngram = ''
    let words: string[] = []

    if (source === TestGramSources.words) {
        words = languages["english"].words
    } else if (source === TestGramSources.bigrams) {
        words = ngrams.biGrams
    } else if (source === TestGramSources.trigrams) {
        words = ngrams.triGrams
    } else if (source === TestGramSources.tetragrams) {
        words = ngrams.tetraGrams
    }

    if (scope === TestGramScopes.fifty) words = words.slice(0, 50)
    else if (scope === TestGramScopes.oneHundred) words = words.slice(0, 100)
    else if (scope === TestGramScopes.twoHundred) words = words.slice(0, 200)

    for (let i = 0; i < combination; i++) {
        const levelGram = words[(level * combination) + i] as string
        ngram = ngram += levelGram + ' '
    }

    for (let i = 0; i < repetition; i++) {
        ngram = ngram += ngram
    }

    // Remove last space
    return ngram.toLowerCase().slice(0, -1)
}

export const buildText = (text: string, charStates: ("incorrect" | "default" | "correct")[], position: number, index = 0) => {
    const initialIndex = index
    const words: JSX.Element[] = []
    text.split(" ").forEach(word => {
        const letters: JSX.Element[] = []

        word.split("").forEach(letter => {
            letters.push(
                <div key={"c-" + index.toString()} id={"c" + index.toString()}
                    className={`
                        ${charStates[index] === 'correct' ? 'text-base-300' : ''}
                        ${charStates[index] === 'incorrect' ? 'text-secondary underline' : ''}
                        ${index === position ? 'active-char text-primary' : ''}
                `}>{letter}</div>
            );
            index += 1;
        })

        // add space to end of word
        if (index !== (text.length + initialIndex)) {
            letters.push(
                <div key={"c-" + index.toString()} id={"c" + index.toString()}
                    className={`
                    ${charStates[index] === 'correct' ? 'text-base-300' : ''}
                    ${charStates[index] === 'incorrect' ? 'text-secondary underline' : ''}
                    ${index === position ? 'active-char text-primary' : ''}
                `}
                >&nbsp;</div>
            );
            index += 1;
        }

        // add word
        words.push(<div key={index} className="inline-flex">{letters}</div>);
    })

    return words;
}

export const getGramLevelText = (level: number, combination: number, scope: TestGramScopes) => {
    if (scope === TestGramScopes.fifty) {
        const total: number = Math.ceil(50 / combination)

        return `${level}/${total}`
    }
    else if (scope === TestGramScopes.oneHundred) {
        const total: number = Math.ceil(100 / combination)

        return `${level}/${total}`
    }
    else {
        const total: number = Math.ceil(200 / combination)

        return `${level}/${total}`
    }
}