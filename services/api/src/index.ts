import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { readConfig } from './config.js'

const config = readConfig()
const { app, store, drain } = createApp({ config })

const server = serve({
  fetch: app.fetch,
  port: config.port,
  hostname: '127.0.0.1',
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void drain().finally(() => store.close())
    })
  })
}
