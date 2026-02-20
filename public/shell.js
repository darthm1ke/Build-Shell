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
    animation: fade-in 220ms ease;
  }

  .shell-text {
    margin: 0;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .shell-empty {
    color: #5f6d79;
    font-size: 0.86rem;
    margin: 0;
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
    phaseCopy.textContent = 'Applying layout blocks and typing content into the page.'
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

async function typeText(target, text) {
  const chars = [...text]
  for (const char of chars) {
    target.textContent += char
    await wait(13)
  }
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

async function playRun(run) {
  clearStage()
  loadRunStyles(run.stylesheets || [])
  hideBuildFloat()
  commitCopy.textContent = `${run.commit.repository} ${run.commit.branch} ${run.commit.sha.slice(0, 7)}  ${run.commit.message}`
  logLine(`start ${run.commit.sha.slice(0, 7)} ${run.steps.length} steps`)

  for (const step of run.steps) {
    const shellNode = document.createElement(step.tag || 'div')
    shellNode.classList.add('shell-node')

    if (step.idAttr) {
      shellNode.id = step.idAttr
    }
    if (step.classAttr) {
      const classes = step.classAttr.split(' ').filter(Boolean)
      shellNode.classList.add(...classes)
    }

    stageRoot.append(shellNode)

    if (step.text) {
      const textNode = document.createElement('p')
      textNode.className = 'shell-text'
      shellNode.append(textNode)
      await typeText(textNode, step.text)
    } else {
      const textNode = document.createElement('p')
      textNode.className = 'shell-empty'
      textNode.textContent = 'layout block mounted'
      shellNode.append(textNode)
    }

    logLine(`apply ${step.tag} ${step.idAttr || step.classAttr || ''}`.trim())
    await wait(step.delayMs)
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
