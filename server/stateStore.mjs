const state = {
  phase: 'idle',
  currentRun: null,
  queuedRuns: 0,
  updatedAt: new Date().toISOString(),
}

const listeners = new Set()

function emit(type, payload) {
  const packet = { type, payload }
  for (const listener of listeners) {
    listener(packet)
  }
}

function touch() {
  state.updatedAt = new Date().toISOString()
}

export function getState() {
  return {
    ...state,
  }
}

export function setPhase(phase) {
  state.phase = phase
  touch()
  emit('state', getState())
}

export function setCurrentRun(run) {
  state.currentRun = run
  touch()
  emit('state', getState())
}

export function setQueueSize(count) {
  state.queuedRuns = count
  touch()
  emit('state', getState())
}

export function pushEvent(type, payload) {
  emit(type, payload)
}

export function subscribe(listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
