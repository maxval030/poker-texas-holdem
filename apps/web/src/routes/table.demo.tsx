import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { demoUpdate } from '../table/fixture.ts'
import { useTableStore } from '../table/store.ts'
import { TableScreen } from '../table/TableScreen.tsx'

export const Route = createFileRoute('/table/demo')({
  component: DemoTable,
  ssr: false,
})

/**
 * A layout harness. It pushes one real hand into the store and no transport, so
 * the table can be developed and checked on a device before either the worker
 * or the server exists.
 */
function DemoTable() {
  useEffect(() => {
    const now = Date.now()
    const { update, self } = demoUpdate(now)
    useTableStore.setState({
      status: 'open',
      view: update.view,
      self,
      seq: update.seq,
      clockSkewMs: 0,
    })
  }, [])

  return <TableScreen title="Demo table" />
}
