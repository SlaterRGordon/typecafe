import english10k from './languages/english10k.json'

export const generateText = (count: number) => {
    let text = ''

    // Generate random text
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * english10k.words.length)
        const randomWord = String(english10k.words[randomIndex])
        text = text += randomWord + ' '
    }

    // Remove last space
    return text.slice(0, -1)
}

export const buildText = (text: string, index=0) => {
    const words: JSX.Element[] = []
    text.split(" ").forEach(word => {
        const letters: JSX.Element[] = []
        word.split("").forEach(letter => {
            letters.push(<div key={index} id={index.toString()}>{letter}</div>);
            index += 1;
        })

        // add space to end of word
        if (index != text.length) {
            letters.push(<div key={index} id={index.toString()}>&nbsp;</div>);
            index += 1;
        }

        // add word
        words.push(<div key={index} className="inline-flex">{letters}</div>);
    })

    return words;
}