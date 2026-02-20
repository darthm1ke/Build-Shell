import { exec } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createDemoPayload, createReplayRun } from './replayBuilder.mjs'
import { getState, pushEvent, setCurrentRun, setPhase, setQueueSize, subscribe } from './stateStore.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

const port = Number(process.env.PORT || 8787)
const siteRoot = path.resolve(rootDir, process.env.SITE_ROOT || 'example-site')
const siteEntryPath = path.resolve(siteRoot, process.env.SITE_ENTRY || 'index.html')
const shellPath = path.resolve(rootDir, 'public/shell.html')
const buildCommand = process.env.BUILD_COMMAND || ''

const app = express()
const sseClients = new Set()
const runQueue = []
let isProcessing = false

app.use(express.json())
app.use('/plugin/assets', express.static(path.resolve(rootDir, 'public')))
app.use(express.static(siteRoot, { index: false }))

function sendSse(res, name, data) {
  res.write(`event: ${name}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function broadcast(name, data) {
  for (const res of sseClients) {
    sendSse(res, name, data)
  }
}

subscribe((packet) => {
  broadcast(packet.type, packet.payload)
})

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function runBuildCommand() {
  if (!buildCommand) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const child = exec(buildCommand, { cwd: rootDir }, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })

    child.stdout?.on('data', (chunk) => {
      pushEvent('log', { line: String(chunk).trim() })
    })

    child.stderr?.on('data', (chunk) => {
      pushEvent('log', { line: String(chunk).trim() })
    })
  })
}

async function processQueue() {
  if (isProcessing || runQueue.length === 0) {
    return
  }

  isProcessing = true
  const payload = runQueue.shift()
  setQueueSize(runQueue.length)

  try {
    setPhase('building')
    setCurrentRun(null)
    await runBuildCommand()
    await wait(450)

    const run = await createReplayRun({ payload, siteEntryPath })
    if (!run) {
      setPhase('idle')
      return
    }

    setCurrentRun(run)
    setPhase('replaying')
    pushEvent('run', run)

    const totalDelay = run.steps.reduce((sum, step) => sum + (step.estimatedMs || step.delayMs || 0), 0)
    await wait(totalDelay + 650)

    setPhase('ready')
  } catch (error) {
    setPhase('idle')
    pushEvent('log', { line: `build flow failed: ${String(error.message || error)}` })
  } finally {
    isProcessing = false
    if (runQueue.length > 0) {
      void processQueue()
    }
  }
}

app.get('/plugin/state', (_req, res) => {
  res.json(getState())
})

app.get('/plugin/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Cache-Control', 'no-cache')
  res.flushHeaders()

  sseClients.add(res)
  sendSse(res, 'state', getState())

  req.on('close', () => {
    sseClients.delete(res)
  })
})

app.post('/plugin/demo', (_req, res) => {
  runQueue.push(createDemoPayload())
  setQueueSize(runQueue.length)
  void processQueue()
  res.json({ ok: true, queued: runQueue.length })
})

app.post('/plugin/webhook', (req, res) => {
  const eventType = req.get('x-github-event')
  if (eventType && eventType !== 'push') {
    res.status(202).json({ ok: true, ignored: true, eventType })
    return
  }

  runQueue.push(req.body)
  setQueueSize(runQueue.length)
  void processQueue()
  res.json({ ok: true, queued: runQueue.length })
})

app.get('/', (_req, res) => {
  const state = getState()
  if (state.phase === 'ready') {
    res.sendFile(siteEntryPath)
    return
  }

  res.sendFile(shellPath)
})

app.listen(port, () => {
  // checking startup path while wiring local shell mode
  console.log(`[plugin] listening on http://localhost:${port}`)
})
