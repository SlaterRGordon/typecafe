import { TestSubModes } from "~/components/typer/types";

export interface Level {
    name: string,
    description: string,
    keys: string,
    subMode: TestSubModes,
    count: number,
    easy: Difficulty,
    medium: Difficulty,
    hard: Difficulty,
}

export interface Difficulty {
    wpm: number,
    accuracy: number,
}

export const levels: Level[] = [
    {
        name: 'Level 1',
        description: 'Learn the home row keys',
        keys: 'asdfjkl',
        subMode: TestSubModes.words,
        count: 10,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 2',
        description: 'Learn the home row keys',
        keys: 'asdfjkl',
        subMode: TestSubModes.words,
        count: 25,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 3',
        description: 'Learn the home row keys',
        keys: 'asdfjkl',
        subMode: TestSubModes.words,
        count: 50,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 4',
        description: 'Learn the home row keys',
        keys: 'erdfuijk',
        subMode: TestSubModes.words,
        count: 10,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 5',
        description: 'Learn the home row keys',
        keys: 'erdfuijk',
        subMode: TestSubModes.words,
        count: 25,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 6',
        description: 'Learn the home row keys',
        keys: 'erdfuijk',
        subMode: TestSubModes.words,
        count: 50,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 7',
        description: 'Learn the home row keys',
        keys: 'ertyuidfghjk',
        subMode: TestSubModes.words,
        count: 10,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 8',
        description: 'Learn the home row keys',
        keys: 'ertyuidfghjk',
        subMode: TestSubModes.words,
        count: 25,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 9',
        description: 'Learn the home row keys',
        keys: 'ertyuidfghjk',
        subMode: TestSubModes.words,
        count: 50,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 10',
        description: 'Learn the home row keys',
        keys: 'ertyuisdfghjkl',
        subMode: TestSubModes.words,
        count: 10,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 11',
        description: 'Learn the home row keys',
        keys: 'ertyuisdfghjkl',
        subMode: TestSubModes.words,
        count: 25,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 12',
        description: 'Learn the home row keys',
        keys: 'ertyuisdfghjkl',
        subMode: TestSubModes.words,
        count: 50,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 13',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjkl',
        subMode: TestSubModes.words,
        count: 10,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 14',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjkl',
        subMode: TestSubModes.words,
        count: 25,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 15',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjkl',
        subMode: TestSubModes.words,
        count: 50,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 16',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjklcn',
        subMode: TestSubModes.words,
        count: 10,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 17',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjklcn',
        subMode: TestSubModes.words,
        count: 25,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 18',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjklcn',
        subMode: TestSubModes.words,
        count: 50,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 19',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjklcvbn',
        subMode: TestSubModes.words,
        count: 10,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 20',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjklcvbn',
        subMode: TestSubModes.words,
        count: 25,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 21',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjklcvbn',
        subMode: TestSubModes.words,
        count: 50,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 22',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjklxcvbnm',
        subMode: TestSubModes.words,
        count: 10,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 23',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjklxcvbnm',
        subMode: TestSubModes.words,
        count: 25,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 24',
        description: 'Learn the home row keys',
        keys: 'wertyuiosdfghjklxcvbnm',
        subMode: TestSubModes.words,
        count: 50,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 25',
        description: 'Learn the home row keys',
        keys: 'qwertyuiopasdfghjklzxcvbnm',
        subMode: TestSubModes.words,
        count: 10,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 26',
        description: 'Learn the home row keys',
        keys: 'qwertyuiopasdfghjklzxcvbnm',
        subMode: TestSubModes.words,
        count: 25,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    },
    {
        name: 'Level 27',
        description: 'Learn the home row keys',
        keys: 'qwertyuiopasdfghjklzxcvbnm',
        subMode: TestSubModes.words,
        count: 50,
        easy: {
            wpm: 40,
            accuracy: 90,
        },
        medium: {
            wpm: 80,
            accuracy: 90,
        },
        hard: {
            wpm: 120,
            accuracy: 90,
        },
    }
]