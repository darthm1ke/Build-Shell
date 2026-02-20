import fs from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'node-html-parser'

function getCommitInfo(payload) {
  const commits = Array.isArray(payload?.commits) ? payload.commits : []
  const head = payload?.head_commit || commits.at(-1)

  if (!head) {
    return null
  }

  const branch = typeof payload.ref === 'string' ? payload.ref.replace('refs/heads/', '') : 'main'

  return {
    sha: String(head.id || Date.now()),
    message: String(head.message || 'Build update'),
    author: String(payload?.pusher?.name || 'unknown'),
    branch,
    repository: String(payload?.repository?.full_name || 'local/site'),
  }
}

function readStylesheets(document) {
  const styles = []
  const links = document.querySelectorAll('link')

  for (const link of links) {
    if (link.getAttribute('rel') !== 'stylesheet') {
      continue
    }

    const href = link.getAttribute('href')
    if (href) {
      styles.push(href)
    }
  }

  return styles
}

function toElementStep(node, index) {
  const rawText = (node.textContent || '').replace(/\s+/g, ' ').trim()
  const text = rawText.slice(0, 240)
  const classes = node.getAttribute('class') || ''
  const id = node.getAttribute('id') || ''
  const targetTag = node.tagName.toLowerCase()
  const stepDelay = 420 + index * 80

  return {
    id: `step-${index + 1}`,
    tag: targetTag,
    idAttr: id,
    classAttr: classes,
    text,
    delayMs: stepDelay,
  }
}

function bodyElementSteps(document) {
  const body = document.querySelector('body')
  if (!body) {
    return []
  }

  const topNodes = body.childNodes.filter((node) => node.nodeType === 1)
  return topNodes.map(toElementStep)
}

export async function createReplayRun({ payload, siteEntryPath }) {
  const commit = getCommitInfo(payload)
  if (!commit) {
    return null
  }

  const html = await fs.readFile(siteEntryPath, 'utf8')
  const document = parse(html)
  const stylesheets = readStylesheets(document)
  const steps = bodyElementSteps(document)

  return {
    runId: `${Date.now()}-${commit.sha.slice(0, 7)}`,
    commit,
    createdAt: new Date().toISOString(),
    siteEntry: path.basename(siteEntryPath),
    stylesheets,
    steps,
  }
}

export function createDemoPayload() {
  return {
    ref: 'refs/heads/main',
    repository: { full_name: 'demo/AI-Site-Builder' },
    pusher: { name: 'demo-dev' },
    head_commit: {
      id: '1af64ff9c22fa09bcf61120c0b4ca49dc11e9ed1',
      message: 'Update layout and stream text fill animation',
    },
    commits: [
      {
        id: '1af64ff9c22fa09bcf61120c0b4ca49dc11e9ed1',
        message: 'Update layout and stream text fill animation',
        added: [],
        modified: ['index.html', 'styles.css'],
        removed: [],
      },
    ],
  }
}
