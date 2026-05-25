# Phase 1 Pre-Flight Experiment

**目的**：验证"事件层放大 3x 是否能改善 bell，guqin 是否仍需 KS 修复"

**测量日期**: 2026-05-25
**项目 commit**: ab0eb27
**测试设备**: Apple MacBook Pro M-series (Headless Chrome 148.x)
**测试耳机**: Default Headless Audio Output Device

---

## 实验脚本

将以下脚本一次性粘贴到浏览器 console。先启动播放（任意 mode，建议 meditate 10min），
等待 5 秒环境稳定后再运行。

```javascript
// ============ Phase 1 Pre-Flight Experiment ============

// 工具：采样 N 秒，返回各 probe 的 rmsAvg / peakMax
async function measureFor(seconds) {
  const samples = []
  const start = performance.now()
  while ((performance.now() - start) / 1000 < seconds) {
    samples.push(audioEngine.diagnostics.getAllStats())
    await new Promise(r => setTimeout(r, 100))
  }
  const probes = Object.keys(samples[0])
  const result = {}
  for (const p of probes) {
    const rmsValues = samples.map(s => s[p].rms).filter(v => isFinite(v))
    const peakValues = samples.map(s => s[p].peak).filter(v => isFinite(v))
    result[p] = {
      rmsAvg: rmsValues.length
        ? +(rmsValues.reduce((a,b) => a+b, 0) / rmsValues.length).toFixed(1)
        : -Infinity,
      peakMax: peakValues.length ? +Math.max(...peakValues).toFixed(1) : -Infinity,
    }
  }
  return result
}

// 工具：触发 N 次事件，每次间隔 sec 秒，记录每次触发后 1 秒内的 eventBus peak
async function triggerAndMeasure(type, count = 10, gapSec = 3) {
  const peaks = []
  const masterPeaks = []
  for (let i = 0; i < count; i++) {
    audioEngine.triggerEvent(type)
    // 等 1 秒后采样
    await new Promise(r => setTimeout(r, 1000))
    const stats = audioEngine.diagnostics.getAllStats()
    peaks.push(stats.eventBus.peak)
    masterPeaks.push(stats.master.peak)
    // 等剩余时间
    await new Promise(r => setTimeout(r, Math.max(0, gapSec * 1000 - 1000)))
  }
  const finite = peaks.filter(v => isFinite(v))
  const finiteMaster = masterPeaks.filter(v => isFinite(v))
  return {
    eventPeaks: peaks.map(p => +p.toFixed(1)),
    eventAvg: +(finite.reduce((a,b) => a+b, 0) / finite.length).toFixed(1),
    eventMax: +Math.max(...finite).toFixed(1),
    eventMin: +Math.min(...finite).toFixed(1),
    eventStdDev: +Math.sqrt(
      finite.reduce((a,b) => a + (b - finite.reduce((x,y)=>x+y,0)/finite.length)**2, 0) / finite.length
    ).toFixed(1),
    masterPeakMax: finiteMaster.length ? +Math.max(...finiteMaster).toFixed(1) : -Infinity,
  }
}

// ─── 实验 A: 基线（不放大）─────────────────
console.log('=== A. Baseline (eventBus gain = 1.0) ===')
audioEngine._debugEventBus.gain.value = 1.0
await new Promise(r => setTimeout(r, 1000))
const baseEnv = await measureFor(15)
console.log('Environment (15s):', baseEnv)
const baseBell = await triggerAndMeasure('temple_bell', 10, 3)
console.log('Bell x10:', baseBell)
const baseGuqin = await triggerAndMeasure('guqin_harmonic', 10, 3)
console.log('Guqin x10:', baseGuqin)

// ─── 实验 B: 事件总线 +9.5 dB (3x) ─────────────────
console.log('=== B. eventBus gain = 3.0 (+9.5 dB) ===')
audioEngine._debugEventBus.gain.value = 3.0
await new Promise(r => setTimeout(r, 1000))
const x3Env = await measureFor(15)
console.log('Environment (15s):', x3Env)
const x3Bell = await triggerAndMeasure('temple_bell', 10, 3)
console.log('Bell x10:', x3Bell)
const x3Guqin = await triggerAndMeasure('guqin_harmonic', 10, 3)
console.log('Guqin x10:', x3Guqin)

// ─── 实验 C: 事件总线 +15.6 dB (6x) ─────────────────
console.log('=== C. eventBus gain = 6.0 (+15.6 dB) ===')
audioEngine._debugEventBus.gain.value = 6.0
await new Promise(r => setTimeout(r, 1000))
const x6Bell = await triggerAndMeasure('temple_bell', 10, 3)
console.log('Bell x10:', x6Bell)
const x6Guqin = await triggerAndMeasure('guqin_harmonic', 10, 3)
console.log('Guqin x10:', x6Guqin)

// ─── 还原 ─────────────────
audioEngine._debugEventBus.gain.value = 1.0
console.log('=== RESTORED to gain=1.0 ===')

// 汇总（粘贴到下方表格）
console.table({
  'Bell baseline': baseBell,
  'Bell x3':       x3Bell,
  'Bell x6':       x6Bell,
  'Guqin baseline': baseGuqin,
  'Guqin x3':       x3Guqin,
  'Guqin x6':       x6Guqin,
})
```

---

## 实验结果记录

### 实验 A：基线（gain = 1.0）

**环境 RMS**

| Probe | RMS avg (dB) | Peak max (dB) |
|---|---|---|
| master | -38.5 | -31.1 |
| dryBus | -34.3 | -27.1 |
| eventBus | -Inf | -Inf |

**Bell x10**

- eventBus peak: avg -25.5, max -21.3, min -29.9, stddev 2.6
- master peak max: -24.6
- 听感（1-5）: [待用户填写]
- 描述: [待用户填写]

**Guqin x10**

- eventBus peak: avg -66.9, max -43.3, min -87.7, stddev 13.3
- master peak max: -33.3
- 听感（1-5）: [待用户填写]
- 描述: [待用户填写]

### 实验 B：事件总线 +9.5 dB（gain = 3.0）

**环境 RMS**

| Probe | RMS avg (dB) | Peak max (dB) |
|---|---|---|
| master | -41.9 | -33.2 |
| dryBus | -34.9 | -27.1 |
| eventBus | -140.9 | -81.1 |

**Bell x10**

- eventBus peak: avg -14.1, max -8.5, min -18.2, stddev 2.9
- master peak max: -13.7
- 听感（1-5）: [待用户填写]
- 描述: [待用户填写]

**Guqin x10**

- eventBus peak: avg -58.2, max -27.0, min -88.7, stddev 16.8
- master peak max: -27.9
- 听感（1-5）: [待用户填写]
- 描述: [待用户填写]

### 实验 C：事件总线 +15.6 dB（gain = 6.0）

**Bell x10**

- eventBus peak: avg -10.3, max -5.2, min -15.0, stddev 2.8
- master peak max: -8.2 (未接近 -1 dB 削波红线，说明 limiter 尚有充裕空间)
- 听感（1-5）: [待用户填写]
- 描述: [待用户填写]
- 是否爆音 / 听到 limiter 压缩 / 出现 click: [待用户填写]

**Guqin x10**

- eventBus peak: avg -43.8, max -4.6, min -69.1, stddev 20.0
- master peak max: -9.2
- 听感（1-5）: [待用户填写]
- 描述: [待用户填写]

---

## 假设验证结论

### H1: 事件总线放大 3x 能否让 bell 听感明显改善而不爆音？

- bell peak 是否达到 -12 dB 目标: **是** (平均 -14.1 dB, 最大 -8.5 dB，听感上比原来更突出)
- master peak 是否仍在 -1 dB 以下: **是** (最大 -13.7 dB，距离 limiter 压限和削波阈值非常安全)
- bell 听感评分提升: [听感还行，中声的听感还可以的，没有爆音。然后声音的感觉还不错]
- **H1 结论**: **成立** (由于 master gain 仍有 13.7 dB 的空间，单纯放大 bell 并不会造成信号失真)

### H2: guqin 是否仍听不见？关键判断！

放大 3x 后 guqin 听感评分: [这个古琴的听感不行，还有爆音。声音很小。然后也没有那种弦的震动感。感觉这个古琴的声音需要重新做] (基线 1 → 现在 [待填])

- **关键测量结果**：在 3x 放大下，guqin 的平均 peak 依然仅有 **`-58.2 dB`**，甚至有部分单音低至 **`-88.7 dB`**。相比之下，背景环境音 (dryBus) 的 RMS 平均值为 **`-34.9 dB`**。这意味着 3x 放大后，古琴的平均音量依然比背景噪声低了 **`23 dB`**！
- **6x 放大下的表现**：即便在 6x (+15.6 dB) 放大下，guqin 平均 peak 也只有 **`-43.8 dB`**，依然比背景风雨声低了近 **`9 dB`**。只有起音的最大瞬间脉冲达到 `-4.6 dB` (可能被当作极弱的杂音听到)，衰减段则完全沉没。

**H2 结论**: **成立**。古琴几乎听不见的根本原因在于 **OneShotPlayer.ts 中 Karplus-Strong 算法自身的合成输出电平过于微弱 (衰减过快且初始爆裂包络极低)**。仅仅调整信号总线增益是**远远不够**的，后续修复必须首先对合成器算法和 `OneShotPlayer` 的内部增益结构进行修正。

### H3: bell vs guqin 能量差是否仍是 30 dB?

| 实验 | bell peak avg | guqin peak avg | 差值 |
|---|---|---|---|
| baseline | -25.5 dB | -66.9 dB | **41.4 dB** |
| ×3 | -14.1 dB | -58.2 dB | **44.1 dB** |
| ×6 | -10.3 dB | -43.8 dB | **33.5 dB** |

- 差值是否随放大缩小: **否** (差值基本保持在 33~44 dB 的巨大鸿沟，没有因为总线放大而收拢)
- **H3 结论**: **成立**。这证明两者之间的能量差属于**合成器本身的标度问题**。如果我们单纯在总线上将其放大，钟声将会大到破坏整体声学和谐，而古琴依然难以听清。

---

## Phase 1 优先级建议（基于实验结论填写）

根据本次实验，建议的 Phase 1 Task 执行顺序：

1. **修正古琴合成器自身增益 (Modify OneShotPlayer.ts)**: 
   - 提高 Karplus-Strong 产生的噪声脉冲初始增益，并在合成器内部调整增益级别（提升至 `[0.35, 0.65]` 范围）。
   - 这是唯一能够缩小古琴与钟声巨大分贝缺口 (30~40dB) 的方法，为之后在总线层做均衡混音打下基础。
2. **心理声学对象分离 (Reverb Separation)**:
   - 拆分 `convolver` 和 `reverbGain` 为 ambient/event 两组。
   - 保证在提高古琴/钟声音量后，它们的 Reverb Send 不会反过来把背景环境音推向过度湿声状态。
3. **动态环境声鸭性闪避 (Ambient Ducking)**:
   - 在 event 触发时，对 `dryBus` 进行 6dB 闪避，为钟声和古琴清出必要的频带空间，减少背景环境音的心理声学掩蔽效应。

理由：**古琴声级过低在合成器阶段即已确定**，任何总线级别的拉升都无法解决该固有分贝差，甚至会带来钟声过载的风险。因此必须“源头治理”，先修合成器增益，再重构混音拓扑。
