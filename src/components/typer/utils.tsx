import english10k from './english10k.json'

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

export const buildText = (text: string) => {
    const textElements = []

    for (let i = 0; i < text.length; i++) {
        const char = text.charAt(i)
        if (char === ' ') 
            textElements.push(<div key={i} id={i.toString()}>&nbsp;</div>)
        else 
            textElements.push(<div key={i} id={i.toString()}>{char}</div>)
    }
    
    return textElements
}