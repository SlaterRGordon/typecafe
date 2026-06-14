// const fs = require('fs');

// const english10k = require('../english10k.json')
// const french10k = require('../french10k.json')
// const chinese10k = require('../chinese10k.json')
// const spanish10k = require('../spanish10k.json')
// const hindi1k = require('../hindi1k.json')

// const languages = {
//     english: english10k,
//     french: french10k,
//     chinese: chinese10k,
//     spanish: spanish10k,
//     hindi: hindi1k,
// }

// const words = languages['english'].words
// const characters = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z']
// const biGrams = []
// const triGrams = []
// const quadGrams = []

// console.log('Creating biGrams, triGrams, and quadGrams...')
// for (let i = 0; i < 26; i++) {
//     for (let j = 0; j < 26; j++) {
//         biGrams.push((characters[i]) + (characters[j]))
//         for (let k = 0; k < characters.length; k++) {
//             triGrams.push((characters[i]) + (characters[j]) + (characters[k]))
//             for (let l = 0; l < characters.length; l++) {
//                 quadGrams.push((characters[i]) + (characters[j]) + (characters[k]) + (characters[l]))
//                 for (let m = 0; m < characters.length; m++) {
//                     quadGrams.push((characters[i]) + (characters[j]) + (characters[k]) + (characters[l]) + (characters[m]))
//                 }
//             }
//         }
//     }
// }

// console.log('Done Pushing biGrams, triGrams, and quadGrams...')

// // const filteredBiGrams = biGrams.filter((biGram) => {
// //     return words.some((word) => {
// //         return word.includes(biGram)
// //     })
// // })
// // const filteredTriGrams = triGrams.filter((triGram) => {
// //     return words.some((word) => {
// //         return word.includes(triGram)
// //     })
// // })
// // const filteredQuadGrams = quadGrams.filter((quadGram) => {
// //     return words.some((word) => {
// //         return word.includes(quadGram)
// //     })
// // })

// const filteredPentaGrams = quadGrams.filter((quadGram) => {
//     return words.some((word) => {
//         return word.includes(quadGram)
//     })
// })

// console.log('Done Filtering biGrams, triGrams, and quadGrams...')

// // const biGramData = JSON.stringify(filteredBiGrams);
// // fs.writeFileSync('biGrams.json', biGramData);

// // const triGramData = JSON.stringify(filteredTriGrams);
// // fs.writeFileSync('triGrams.json', triGramData);

// // const quadGramData = JSON.stringify(filteredQuadGrams);
// // fs.writeFileSync('quadGrams.json', quadGramData);

// const pentaGramData = JSON.stringify(filteredPentaGrams);
// fs.writeFileSync('pentaGrams.json', pentaGramData);

// console.log('Done Writing biGrams, triGrams, and quadGrams...')