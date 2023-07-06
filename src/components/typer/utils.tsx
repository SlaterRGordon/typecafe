import english10k from './languages/english10k.json'
import french10k from './languages/french10k.json'
import chinese10k from './languages/chinese10k.json'
import spanish10k from './languages/spanish10k.json'
import hindi1k from './languages/hindi1k.json'

const languages = {
    english: english10k,
    french: french10k,
    chinese: chinese10k,
    spanish: spanish10k,
    hindi: hindi1k,
}

export const generateText = (count: number, language: string) => {
    let text = ''

    console.log(language)

    // Generate random text
    for (let i = 0; i < count; i++) {
        const words = languages[language as keyof typeof languages].words
        const randomIndex = Math.floor(Math.random() * words.length)
        const randomWord = String(words[randomIndex])
        text = text += randomWord + ' '
    }

    // Remove last space
    return text.toLowerCase().slice(0, -1)
}

export const buildText = (text: string, index=0) => {
    const words: JSX.Element[] = []
    text.split(" ").forEach(word => {
        const letters: JSX.Element[] = []
        word.split("").forEach(letter => {
            if (index == 0) letters.push(<div key={index} id={"c" + index.toString()}>{letter}</div>);
            else letters.push(<div key={index} id={"c" + index.toString()}>{letter}</div>);
            index += 1;
        })

        // add space to end of word
        letters.push(<div key={index} id={"c" + index.toString()}>&nbsp;</div>);
        index += 1;

        // add word
        words.push(<div key={index} className="inline-flex">{letters}</div>);
    })

    return words;
}