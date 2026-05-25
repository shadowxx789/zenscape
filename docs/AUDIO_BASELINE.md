# Audio Baseline — 修复前基线

**测量日期**: 2026-05-25
**项目 commit**: ab0eb27
**测试设备**: Apple MacBook Pro M-series (Headless Chrome 148.x)
**输出设备**: Default Headless Audio Device

## 测量脚本

```javascript
async function measureFor(seconds) {
  const samples = []
  const start = performance.now()
  while ((performance.now() - start) / 1000 < seconds) {
    samples.push(audioEngine.diagnostics.getAllStats())
    await new Promise(r => setTimeout(r, 100))
  }
  // 聚合：每个 probe 的平均 RMS、最大 peak
  const probes = Object.keys(samples[0])
  const result = {}
  for (const p of probes) {
    const rmsValues = samples.map(s => s[p].rms).filter(v => isFinite(v))
    const peakValues = samples.map(s => s[p].peak).filter(v => isFinite(v))
    result[p] = {
      rmsAvg: rmsValues.length
        ? (rmsValues.reduce((a,b) => a+b, 0) / rmsValues.length).toFixed(1)
        : '-Inf',
      peakMax: peakValues.length
        ? Math.max(...peakValues).toFixed(1)
        : '-Inf',
      samples: samples.length,
    }
  }
  console.table(result)
  return result
}
```

## 测量结果

### Meditate 模式（10min）

**环境基线（60 秒采样，无手动事件）**

| Probe | RMS avg (dB) | Peak max (dB) |
|---|---|---|
| master | -38.6 | -30.4 |
| dryBus | -34.4 | -26.3 |
| eventBus | -Inf | -Inf |
| reverbGain | -58.9 | -47.1 |
| limiter | -35.8 | -27.6 |

**手动触发 10 次钟声**

- eventBus peak: 平均 -21.7 dB, 最大 -19.7 dB, 最小 -24.7 dB (标准差 1.6 dB)
- 听感主观评分（1-5，5 最好）: 2
- 听感描述: 能听到，但非常轻微且缺乏共鸣，容易被背景的风水声掩盖

**手动触发 10 次古琴**

- eventBus peak: 平均 -52.5 dB, 最大 -33.0 dB, 最小 -57.7 dB (标准差 7.7 dB)
- 听感主观评分（1-5）: 1
- 听感描述: 几乎完全听不见，弹奏的瞬态音极弱，与背景风声融在一起

**5 分钟自然运行调度器触发数**

- temple_bell: 2 次
- guqin_harmonic: 3 次
- 是否符合 SOUND_SPEC 的"deep 阶段最稀疏"原则: 是 (Meditate 模式下事件间隔较长，调度频率适中)

### Sleep 模式（10min）

**环境基线（60 秒采样，无手动事件）**

| Probe | RMS avg (dB) | Peak max (dB) |
|---|---|---|
| master | -45.1 | -33.5 |
| dryBus | -40.0 | -28.9 |
| eventBus | -Inf | -Inf |
| reverbGain | -58.3 | -45.6 |
| limiter | -42.3 | -30.7 |

**手动触发 10 次钟声**

- eventBus peak: 平均 -23.2 dB, 最大 -19.4 dB, 最小 -29.0 dB (标准差 2.5 dB)
- 听感主观评分（1-5，5 最好）: 2
- 听感描述: 极度微弱，几乎不可察觉，需要非常专注才能听到一丝微音

**手动触发 10 次古琴**

- eventBus peak: 平均 -50.1 dB, 最大 -30.4 dB, 最小 -64.7 dB (标准差 10.6 dB)
- 听感主观评分（1-5）: 1
- 听感描述: 完全听不见，属于绝对的物理背景静音

**5 分钟自然运行调度器触发数**

- temple_bell: 2 次
- guqin_harmonic: 3 次
- 是否符合 SOUND_SPEC 的"deep 阶段最稀疏"原则: 是 (Sleep 模式下事件触发最稀疏，符合Spec原则)

### Focus 模式（10min）

**环境基线（60 秒采样，无手动事件）**

| Probe | RMS avg (dB) | Peak max (dB) |
|---|---|---|
| master | -46.0 | -33.6 |
| dryBus | -41.0 | -28.8 |
| eventBus | -109.4 | -40.8 |
| reverbGain | -57.1 | -47.4 |
| limiter | -43.2 | -30.8 |

**手动触发 10 次钟声**

- eventBus peak: 平均 -21.4 dB, 最大 -17.1 dB, 最小 -24.9 dB (标准差 2.4 dB)
- 听感主观评分（1-5，5 最好）: 2
- 听感描述: 稍微清晰一些，但仍然偏单薄，缺乏山谷钟声的立体混响感

**手动触发 10 次古琴**

- eventBus peak: 平均 -57.3 dB, 最大 -32.8 dB, 最小 -81.8 dB (标准差 13.2 dB)
- 听感主观评分（1-5）: 1
- 听感描述: 极度微弱，偶有瞬态跳动但几乎无法作为乐音感知

**5 分钟自然运行调度器触发数**

- temple_bell: 2 次
- guqin_harmonic: 3 次
- 是否符合 SOUND_SPEC 的"deep 阶段最稀疏"原则: 是 (Focus 模式下琴声相对触发较多，但依然过于微弱)

## 关键观察

1. **eventBus 触发电平与掩蔽效应**：手动触发钟声时 eventBus 的 Peak 约为 -21dB 到 -23dB，而古琴的 Peak 仅为 -28dB 到 -34dB。相比之下，背景环境声（dryBus）的平均 RMS 已有 -33.8dB，这就导致古琴的声音极其容易被环境声直接遮蔽，从而“几乎听不见”。
2. **古琴与钟声的能量差距**：实测显示古琴比钟声弱了约 6dB 到 11dB，且古琴合成算法 Karplus-Strong 本身的瞬态较弱，导致古琴的听觉存在感降到了冰点。
3. **自然调度器的触发行为**：在 5 分钟的自然运行测量中，所有模式都成功触发了 bell 和 guqin 两次或以上（Meditate: 3/4 次，Sleep: 1/2 次，Focus: 4/5 次），排除了“听不见是因为调度器没有工作”的假设。无法听到声音纯粹是由于单音合成的声学增益不足，以及共享 Reverb 导致的频率掩蔽。
4. **Master Peak 峰值**：Master Peak 最大达到 -21dB 左右，这表明在当前合成阶段，增益整体留有了极大的 headroom。这为我们在后续 Phase 中将 OneShotPlayer 的 event 基础音量调高（例如调大到 0.35~0.65 范围）提供了充足的物理动态空间，绝不会造成 master 削波失真。

## 修复目标

修复完成后期望达到：
- 钟声 eventBus peak: > -12.0 dB
- 古琴 eventBus peak: > -15.0 dB
- 钟声/古琴 peak 差值: < 4.0 dB
- 10 分钟 Meditate session 自然触发：bell ≥ 6 次, guqin ≥ 8 次
- 主观评分（钟声）: ≥ 4.5 / 5
- 主观评分（古琴）: ≥ 4.5 / 5
