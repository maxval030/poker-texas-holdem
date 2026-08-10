#!/bin/sh
set -eu

echo "waiting for postgres…"
until bun -e '
  import net from "node:net"
  await new Promise((resolve, reject) => {
    const socket = net.connect(5432, "postgres", () => {
      socket.end()
      resolve()
    })
    socket.on("error", reject)
  })
'; do
  sleep 1
done

echo "running migrations…"
bun run --cwd apps/server db:migrate

echo "starting holdem server…"
exec bun run --cwd apps/server src/main.ts
