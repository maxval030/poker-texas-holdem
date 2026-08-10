import type { ClientMessage, Transport, TransportEvent } from '@holdem/protocol'
import type { SoloRequest, SoloResponse, SoloSetup } from './messages.ts'

/**
 * The Web Worker half of the transport seam. Nothing above this file knows
 * whether the table is running in a worker or on a server on the other side of
 * the world, which is what lets single player and online share every component.
 */
export function createSoloTransport(setup: SoloSetup): Transport {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
    type: 'module',
    name: 'holdem-solo',
  })

  const listeners = new Set<(event: TransportEvent) => void>()
  // The worker deals the first hand before React has finished mounting, so
  // everything it says is held until somebody is listening. Dropping it would
  // cost the welcome and the opening snapshot.
  let backlog: TransportEvent[] = []
  let open = false
  const queued: ClientMessage[] = []

  const emit = (event: TransportEvent) => {
    if (listeners.size === 0) {
      backlog.push(event)
      return
    }
    for (const listener of listeners) listener(event)
  }

  worker.addEventListener('message', (event: MessageEvent<SoloResponse>) => {
    const response = event.data
    if (response.kind === 'ready') {
      open = true
      emit({ kind: 'status', status: 'open' })
      for (const message of queued.splice(0)) {
        worker.postMessage({ kind: 'send', message } satisfies SoloRequest)
      }
      return
    }
    emit({ kind: 'message', message: response.message })
  })

  worker.addEventListener('error', (event) => {
    console.error('single player worker failed', event.message)
    emit({ kind: 'status', status: 'closed' })
  })

  emit({ kind: 'status', status: 'connecting' })
  worker.postMessage({ kind: 'boot', setup } satisfies SoloRequest)

  return {
    send(message) {
      // Anything sent before the worker has booted is held rather than dropped,
      // which matters because the UI mounts before the first frame is painted.
      if (!open) {
        queued.push(message)
        return
      }
      worker.postMessage({ kind: 'send', message } satisfies SoloRequest)
    },
    subscribe(listener) {
      listeners.add(listener)
      const held = backlog
      backlog = []
      for (const event of held) listener(event)
      return () => listeners.delete(listener)
    },
    close() {
      worker.terminate()
      open = false
      backlog = []
      for (const listener of listeners) listener({ kind: 'status', status: 'closed' })
      listeners.clear()
    },
  }
}
