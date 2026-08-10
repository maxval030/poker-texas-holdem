import { Elysia } from 'elysia'
import { hasValidGate } from './session.ts'

export const gatePlugin = new Elysia({ name: 'gate' }).macro({
  gate: {
    async resolve({ request, status }) {
      if (!(await hasValidGate(request.headers))) {
        return status(403, { error: 'verification required' })
      }
    },
  },
})
