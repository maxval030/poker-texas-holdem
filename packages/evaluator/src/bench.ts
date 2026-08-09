import { DECK_SIZE, seededRng } from '@holdem/engine'
import { evaluate } from '@pokertools/evaluator'
import { shuffle } from 'radashi'
import { createEquityEstimator } from './equity.ts'

function time(label: string, iterations: number, body: () => void): number {
  body()
  const started = performance.now()
  for (let i = 0; i < iterations; i++) body()
  const elapsed = performance.now() - started
  const perSecond = Math.round(iterations / (elapsed / 1000))
  console.info(
    `${label.padEnd(46)} ${elapsed.toFixed(1).padStart(8)} ms  ${perSecond.toLocaleString()}/s`,
  )
  return elapsed
}

const rng = seededRng(1)
const deck = Array.from({ length: DECK_SIZE }, (_, i) => i)
const typedDeck = Int32Array.from(deck)
const hand = [0, 1, 2, 3, 4, 5, 6]

console.info('\nhand evaluation')
time('evaluate 7 cards', 2_000_000, () => {
  evaluate(hand)
})

// Drawing nine cards is what one simulation of a nine-handed table costs. The
// two variables here are the algorithm and the random source, so they are varied
// separately: radashi hardcodes Math.random, which is a fast native intrinsic,
// and comparing it against a seeded generator written in JavaScript measures the
// generator rather than the shuffle.
console.info('\ndrawing the cards a simulation needs')
const DRAW = 9
const ROUNDS = 200_000

time('radashi shuffle, whole deck, Math.random', ROUNDS, () => {
  const shuffled = shuffle(deck)
  if (shuffled.length !== DECK_SIZE) throw new Error('unreachable')
})

time('partial Fisher-Yates, Int32Array, Math.random', ROUNDS, () => {
  for (let i = 0; i < DRAW; i++) {
    const j = i + ((Math.random() * (DECK_SIZE - i)) | 0)
    const tmp = typedDeck[i] as number
    typedDeck[i] = typedDeck[j] as number
    typedDeck[j] = tmp
  }
})

time('partial Fisher-Yates, Int32Array, seeded xoshiro', ROUNDS, () => {
  for (let i = 0; i < DRAW; i++) {
    const j = i + rng.nextInt(DECK_SIZE - i)
    const tmp = typedDeck[i] as number
    typedDeck[i] = typedDeck[j] as number
    typedDeck[j] = tmp
  }
})

console.info('\nequity estimation inside a 30 ms budget')
const estimate = createEquityEstimator()
for (const opponents of [1, 3, 8]) {
  estimate({
    hole: [51, 47],
    board: [],
    opponents,
    rng: seededRng(1),
    timeBudgetMs: 50,
    maxIterations: 50_000,
  })
}
for (const opponents of [1, 3, 8]) {
  const result = estimate({
    hole: [51, 47],
    board: [],
    opponents,
    rng: seededRng(7),
    timeBudgetMs: 30,
    maxIterations: 10_000_000,
  })
  console.info(
    `  ${opponents} opponent(s): ${result.iterations.toLocaleString()} iterations in ${result.elapsedMs.toFixed(1)} ms, equity ${(result.equity * 100).toFixed(1)}%`,
  )
}
console.info('')
