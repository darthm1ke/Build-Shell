const phaseCopy = document.getElementById('phase-copy')
const commitCopy = document.getElementById('commit-copy')
const phasePill = document.getElementById('phase-pill')
const activityList = document.getElementById('activity-list')
const canvasHost = document.getElementById('build-canvas')
const buildFloat = document.getElementById('build-float')

const shadow = canvasHost.attachShadow({ mode: 'open' })
const stageRoot = document.createElement('div')
stageRoot.className = 'stage-root'
shadow.append(stageRoot)

const baseStyles = document.createElement('style')
baseStyles.textContent = `
  :host {
    display: block;
  }

  .stage-root {
    min-height: 100vh;
    width: 100%;
    padding: 0;
    font-family: system-ui, -apple-system, sans-serif;
    color: #1d272f;
  }

  .shell-node {
    animation: fade-in 260ms ease;
  }

  .shell-empty {
    color: #5f6d79;
    font-size: 0.86rem;
    margin: 0;
    padding: 1rem;
  }

  .dialup-wrap {
    position: relative;
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    background: #e7edf4;
  }

  .dialup-wrap-block {
    display: block;
    width: 100%;
  }

  .dialup-image {
    display: block;
    max-width: 100%;
    clip-path: inset(0 100% 0 0);
    filter: contrast(1.15) saturate(0.8) blur(1.2px);
    opacity: 0.9;
  }

  .dialup-scan {
    position: absolute;
    inset: 0;
    background:
      repeating-linear-gradient(
        to bottom,
        rgba(34, 52, 73, 0.2),
        rgba(34, 52, 73, 0.2) 2px,
        rgba(211, 224, 238, 0.15) 2px,
        rgba(211, 224, 238, 0.15) 5px
      );
    mix-blend-mode: multiply;
    pointer-events: none;
    opacity: 0.88;
    animation: scan-shift 280ms linear infinite;
  }

  .text-pending {
    color: transparent;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes scan-shift {
    from {
      background-position-y: 0;
    }
    to {
      background-position-y: 10px;
    }
  }
`

shadow.prepend(baseStyles)

function showBuildFloat() {
  buildFloat.classList.remove('build-float-hidden')
}

function hideBuildFloat() {
  buildFloat.classList.add('build-float-hidden')
}

function logLine(text) {
  const item = document.createElement('li')
  item.textContent = text
  activityList.prepend(item)

  while (activityList.children.length > 10) {
    activityList.removeChild(activityList.lastChild)
  }
}

function setPhase(phase) {
  phasePill.textContent = phase
  phasePill.className = `phase-pill phase-${phase}`

  if (phase === 'building') {
    phaseCopy.textContent = 'Build started. Preparing shell replay from latest commit.'
  } else if (phase === 'replaying') {
    phaseCopy.textContent = 'Applying layout blocks, images, and typed content.'
  } else if (phase === 'ready') {
    phaseCopy.textContent = 'Build complete. Site can swap to the latest output.'
  } else {
    phaseCopy.textContent = 'Waiting for commit replay.'
    showBuildFloat()
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function clearStage() {
  while (stageRoot.firstChild) {
    stageRoot.removeChild(stageRoot.firstChild)
  }
}

function loadRunStyles(stylesheets) {
  const previous = shadow.querySelectorAll('link[data-run-style="true"]')
  previous.forEach((node) => node.remove())

  stylesheets.forEach((href) => {
    const styleLink = document.createElement('link')
    styleLink.setAttribute('rel', 'stylesheet')
    styleLink.setAttribute('href', `${href}${href.includes('?') ? '&' : '?'}shell_ts=${Date.now()}`)
    styleLink.dataset.runStyle = 'true'
    shadow.prepend(styleLink)
  })
}

function createStepNode(step) {
  if (step.html) {
    const template = document.createElement('template')
    template.innerHTML = step.html.trim()
    const first = template.content.firstElementChild
    if (first) {
      first.classList.add('shell-node')
      return first
    }
  }

  const fallback = document.createElement(step.tag || 'section')
  fallback.classList.add('shell-node')
  if (step.classAttr) {
    fallback.className += ` ${step.classAttr}`
  }
  if (step.idAttr) {
    fallback.id = step.idAttr
  }

  const marker = document.createElement('p')
  marker.className = 'shell-empty'
  marker.textContent = 'layout block mounted'
  fallback.append(marker)

  return fallback
}

function collectTextTargets(node) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  const targets = []
  let textNode = walker.nextNode()

  while (textNode) {
    const value = textNode.textContent || ''
    const normalized = value.replace(/\s+/g, ' ').trim()
    const parent = textNode.parentElement

    if (parent && normalized && !['SCRIPT', 'STYLE'].includes(parent.tagName)) {
      targets.push({ textNode, finalText: value })
    }

    textNode = walker.nextNode()
  }

  return targets
}

async function typeTextNodesSequentially(node) {
  const targets = collectTextTargets(node)

  for (const target of targets) {
    const parent = target.textNode.parentElement
    if (parent) {
      parent.classList.add('text-pending')
    }

    target.textNode.textContent = ''
    for (const char of [...target.finalText]) {
      target.textNode.textContent += char
      await wait(11)
    }

    if (parent) {
      parent.classList.remove('text-pending')
    }
  }
}

async function animateDialupImage(img) {
  const parent = img.parentNode
  if (!parent) {
    return
  }

  const wrap = document.createElement('span')
  wrap.className = 'dialup-wrap'
  const display = window.getComputedStyle(img).display
  if (display === 'block') {
    wrap.classList.add('dialup-wrap-block')
  }

  parent.insertBefore(wrap, img)
  wrap.append(img)

  img.classList.add('dialup-image')

  const scan = document.createElement('span')
  scan.className = 'dialup-scan'
  wrap.append(scan)

  const durationMs = 1500 + Math.floor(Math.random() * 1100)
  const start = performance.now()

  await new Promise((resolve) => {
    function tick(now) {
      const progress = Math.min(1, (now - start) / durationMs)
      const hidden = Math.round((1 - progress) * 100)
      img.style.clipPath = `inset(0 ${hidden}% 0 0)`
      img.style.filter = `contrast(1.15) saturate(${0.8 + progress * 0.2}) blur(${(1 - progress) * 1.2}px)`
      scan.style.opacity = String(0.88 - progress * 0.7)

      if (progress < 1) {
        requestAnimationFrame(tick)
        return
      }

      resolve()
    }

    requestAnimationFrame(tick)
  })

  img.style.clipPath = 'inset(0 0 0 0)'
  img.style.filter = 'none'
  scan.remove()
}

async function animateDialupImages(node) {
  const images = [...node.querySelectorAll('img')]
  for (const image of images) {
    await animateDialupImage(image)
  }
}

async function playRun(run) {
  clearStage()
  loadRunStyles(run.stylesheets || [])
  hideBuildFloat()

  commitCopy.textContent = `${run.commit.repository} ${run.commit.branch} ${run.commit.sha.slice(0, 7)}  ${run.commit.message}`
  logLine(`start ${run.commit.sha.slice(0, 7)} ${run.steps.length} steps`)

  for (const step of run.steps) {
    const shellNode = createStepNode(step)
    stageRoot.append(shellNode)

    const typing = typeTextNodesSequentially(shellNode)
    const images = animateDialupImages(shellNode)

    await Promise.all([typing, images])

    const label = step.previewText || step.idAttr || step.classAttr || step.tag || 'block'
    logLine(`apply ${label}`)
    await wait(step.delayMs || 300)
  }

  logLine('replay complete')
}

const source = new EventSource('/plugin/stream')

source.addEventListener('state', (event) => {
  const state = JSON.parse(event.data)
  setPhase(state.phase)
})

source.addEventListener('run', (event) => {
  const run = JSON.parse(event.data)
  void playRun(run)
})

source.addEventListener('log', (event) => {
  const payload = JSON.parse(event.data)
  if (payload.line) {
    logLine(payload.line)
  }
})

source.onerror = () => {
  setPhase('idle')
  showBuildFloat()
  logLine('stream disconnected, waiting to reconnect')
}
