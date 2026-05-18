const BUFFER_SECONDS = 61
const SAMPLE_RATE = 48000
const LOOP_CROSSFADE_SECONDS = 0.75
const TRIALS = 5

function createRng(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function generatePinkNoise(length, rng) {
  const out = new Float32Array(length)
  const rows = new Float32Array(16)
  let runningSum = 0
  let counter = 0

  for (let i = 0; i < length; i++) {
    counter++
    const lowBit = counter & -counter
    const rowIndex = Math.log2(lowBit) | 0
    if (rowIndex < rows.length) {
      runningSum -= rows[rowIndex]
      rows[rowIndex] = rng() * 2 - 1
      runningSum += rows[rowIndex]
    }
    const white = rng() * 2 - 1
    out[i] = (runningSum + white) / (rows.length + 1)
  }

  return out
}

function shapeForLayer(samples, name, sampleRate) {
  return name === 'wind'
    ? applyOnePoleLowpass(samples, sampleRate, 1500)
    : applyGentleHighpass(samples, sampleRate, 800)
}

function applyOnePoleLowpass(samples, sampleRate, cutoffHz) {
  const out = new Float32Array(samples.length)
  const rc = 1 / (Math.PI * 2 * cutoffHz)
  const dt = 1 / sampleRate
  const alpha = dt / (rc + dt)
  let state = 0

  for (let i = 0; i < samples.length; i++) {
    state += alpha * (samples[i] - state)
    out[i] = state
  }

  return out
}

function applyGentleHighpass(samples, sampleRate, cutoffHz) {
  const out = new Float32Array(samples.length)
  const low = applyOnePoleLowpass(samples, sampleRate, cutoffHz)

  for (let i = 0; i < samples.length; i++) {
    out[i] = samples[i] * 0.5 + (samples[i] - low[i]) * 0.5
  }

  return out
}

function applyLoopCrossfade(samples, sampleRate, fadeSeconds) {
  const out = new Float32Array(samples)
  const fadeSamples = Math.min(
    Math.floor(samples.length / 4),
    Math.max(2, Math.floor(sampleRate * fadeSeconds)),
  )
  if (fadeSamples < 2) return out

  const lastIndex = samples.length - 1
  const tailStart = samples.length - fadeSamples
  const seamValue = (samples[0] + samples[lastIndex]) * 0.5

  for (let i = 0; i < fadeSamples; i++) {
    const t = i / (fadeSamples - 1)
    out[i] = seamValue * (1 - t) + samples[i] * t
    out[tailStart + i] = samples[tailStart + i] * (1 - t) + seamValue * t
  }

  return out
}

function applyBreath(samples, name, sampleRate) {
  const out = new Float32Array(samples.length)

  for (let i = 0; i < samples.length; i++) {
    const breath = name === 'wind'
      ? 0.62 + 0.38 * Math.sin((i / sampleRate) * Math.PI * 2 / 17 + Math.sin(i / sampleRate / 11))
      : 0.82 + 0.18 * Math.sin((i / sampleRate) * Math.PI * 2 / 9.5)
    out[i] = samples[i] * breath
  }

  return out
}

function metrics(samples) {
  let sumSq = 0
  for (let i = 0; i < samples.length; i++) {
    sumSq += samples[i] * samples[i]
  }
  const first = samples[0]
  const last = samples[samples.length - 1]
  const seam = Math.abs(last - first)
  const rms = Math.sqrt(sumSq / samples.length)

  return {
    first,
    last,
    seam,
    rms,
    seamOverRms: seam / rms,
  }
}

function runTrial(name, seed) {
  const length = SAMPLE_RATE * BUFFER_SECONDS
  const pink = generatePinkNoise(length, createRng(seed))
  const shaped = shapeForLayer(pink, name, SAMPLE_RATE)
  const before = applyBreath(shaped, name, SAMPLE_RATE)
  const after = applyLoopCrossfade(before, SAMPLE_RATE, LOOP_CROSSFADE_SECONDS)

  return {
    before: metrics(before),
    after: metrics(after),
  }
}

function average(rows, key) {
  return rows.reduce((sum, row) => sum + row[key], 0) / rows.length
}

for (const name of ['wind', 'water']) {
  const rows = []
  for (let i = 0; i < TRIALS; i++) {
    rows.push(runTrial(name, 0x5eed + i * 997 + (name === 'wind' ? 0 : 10000)))
  }

  const beforeRows = rows.map((row) => row.before)
  const afterRows = rows.map((row) => row.after)

  console.log(JSON.stringify({
    layer: name,
    trials: TRIALS,
    before: {
      first: average(beforeRows, 'first'),
      last: average(beforeRows, 'last'),
      seam: average(beforeRows, 'seam'),
      rms: average(beforeRows, 'rms'),
      seamOverRms: average(beforeRows, 'seamOverRms'),
    },
    after: {
      first: average(afterRows, 'first'),
      last: average(afterRows, 'last'),
      seam: average(afterRows, 'seam'),
      rms: average(afterRows, 'rms'),
      seamOverRms: average(afterRows, 'seamOverRms'),
    },
  }, null, 2))
}
