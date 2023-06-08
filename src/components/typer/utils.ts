import english10k from './english10k.json';

export const generateText = (count: number) => {
    let text = '';

    // Generate random text
    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * english10k.words.length);
        const randomWord = String(english10k.words[randomIndex]);
        text = text += randomWord + ' ';
    }

    // Remove last space
    return text.slice(0, -1);
}