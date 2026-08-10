/// <reference lib="webworker" />
import { cryptoRng, referenceEvaluate7, seededRng } from '@holdem/engine'
import { createEquityEstimator } from '@holdem/evaluator'
import { TableHost } from '@holdem/host'
import type { SoloRequest, SoloResponse } from './messages.ts'

/**
 * Single player runs the whole game in here. The engine, the bots and every
 * timer live off the main thread, so a bot spending thirty milliseconds on a
 * Monte Carlo run cannot drop a frame of the animation on the table.
 *
 * The estimator keeps a module level scratch buffer and is not reentrant, which
 * is exactly why it is built once per worker and never shared.
 */
const estimator = createEquityEstimator()

let host: TableHost | null = null
let playerId = ''

function post(response: SoloResponse): void {
  self.postMessage(response)
}

self.addEventListener('message', (event: MessageEvent<SoloRequest>) => {
  const request = event.data

  if (request.kind === 'boot') {
    host?.dispose()
    const { setup } = request

    host = new TableHost({
      roomId: 'solo',
      config: setup.config,
      // A seed is for reproducing a session in a bug report. Without one the
      // deal comes from the platform CSPRNG, which is the only acceptable
      // source for cards a player is going to bet on.
      rng: setup.seed === undefined ? cryptoRng() : seededRng(setup.seed),
      evaluate7: referenceEvaluate7,
      estimator,
      handIntervalMs: 3_500,
      deliver: (_userId, message) => post({ kind: 'message', message }),
    })

    playerId = setup.player.userId
    host.join(setup.player)
    host.receive(playerId, {
      type: 'sit',
      seat: setup.seat,
      buyIn: setup.buyIn,
    })
    for (const bot of setup.bots) {
      host.receive(playerId, {
        type: 'add-bot',
        seat: bot.seat,
        difficulty: bot.difficulty,
      })
    }
    // The first hand deals as soon as the table is seated. Later hands wait on
    // the interval above, which is the pause that shows who won.
    host.receive(playerId, { type: 'start' })

    post({ kind: 'ready' })
    return
  }

  if (!host) return
  host.receive(playerId, request.message)
})
