import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { readConfig } from './config.js'

const config = readConfig()
const { app, store, drain, cleanupStorage } = createApp({ config })

const server = serve({
  fetch: app.fetch,
  port: config.port,
  hostname: '127.0.0.1',
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

let cleanup = Promise.resolve()
const sweep = () => {
  cleanup = cleanupStorage().then(result => {
    if (result.failed) console.warn(`Storage cleanup will retry ${result.failed} file(s).`)
  }).catch(() => { console.warn('Storage cleanup could not finish; it will retry.') })
}
const retentionTimer = config.hippiusAccessKey && config.hippiusSecretKey && config.hippiusBucket ? setInterval(sweep, 60_000) : undefined
retentionTimer?.unref()
if (retentionTimer) sweep()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    if (retentionTimer) clearInterval(retentionTimer)
    server.close(() => {
      void Promise.allSettled([drain(), cleanup]).finally(() => store.close())
    })
  })
}
