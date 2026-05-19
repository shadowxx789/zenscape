# BreezeScape Sprint 1 技术规格

> **让声音对得起耳机**
> Version 1.0 · 2026-05-17 · 目标受众：Codex / 自己 / 任何接手代码的人

---

## 0. 与路线图的关系

本文档是 `docs/ROADMAP.md` 中 **Sprint 1** 的施工图。

```
ROADMAP.md（战略）
    ↓
本文档（战术）= 把 ROADMAP 第 4 节展开成可执行的 4 个 Task
    ↓
Codex 实施（执行）
```

如果你想知道 Sprint 1 在整体里的位置、为什么先做它、做完之后下一步是什么，请先看 `docs/ROADMAP.md`。

如果你已经决定开工，请继续往下看。

---

## 1. 文档使命

把 BreezeScape 从「能用的合成声景」升级到「可以戴上索尼 1000XM5 听 30 分钟不出戏」的工程标准。

本 Sprint **不做**：
- 不增加新模式
- 不增加新输入
- 不改动 UI

本 Sprint **只做**：
- 把现有 5 层声音的音质重做

完成后听感预期：
- **风/水**：从「沙沙白噪」→「真的像风穿过竹林、水流过石头」
- **钟**：从「带铃声的 sine」→「真的像远山寺钟」
- **古琴**：从「音叉」→「真的有拨弦的指甲触感」
- **整体**：从「干声」→「在山谷里」

---

## 2. 范围与不变量

### 2.1 本 Sprint 4 个 Task

| ID | 名称 | 涉及文件 | 工作量 |
|---|---|---|---|
| **A** | 粉红噪声替换 | `AudioEngine.ts` | S |
| **B** | 寺钟非谐分音 | `OneShotPlayer.ts` | M |
| **C** | Karplus-Strong 古琴 | `OneShotPlayer.ts` | L |
| **D** | 卷积混响总线 | `AudioEngine.ts`, `OneShotPlayer.ts`, `soundscapes.ts` | M |

S ≈ 半天，M ≈ 1-1.5 天，L ≈ 2 天，含调音。

### 2.2 全局不变量（任何 Task 都不能违反）

```
INV-1  外部 API 不变：
        audioEngine.play() / stop() / setMasterVolume() 等
        SessionView.tsx 不需要改任何一行

INV-2  浏览器兼容：Chrome 109+ / Safari 16+ / Firefox 110+
        即不依赖 AudioWorklet（留给 Sprint 2+）

INV-3  无新增 npm 依赖

INV-4  无 click、无爆音、无 DC 偏置
        所有 attack 必须从 0 线性渐起 ≥ 50ms
        所有 stop 必须 fadeGain 总线兜底

INV-5  性能预算（中端手机基线）：
        - 启动到出声 < 500ms
        - 持续 CPU < 8%（iPhone 12 / Pixel 6）
        - 内存增量 < 25 MB
        - 卷积 IR 离线生成，缓存复用

INV-6  代码风格：
        - 不写无意义注释
        - 但声学原理必须有 1-3 行注释解释「为什么这么做」
        - 不许 console.log

INV-7  可回滚：
        每个 Task 一个 PR，单独可 revert
```

---

## 3. 改动后的信号链（总览）

```
                     ┌──────────── 持续层 ─────────────┐
                     │                                 │
   wind (pink)  ─→  filter ─→ panner ─→ layerGain ─→ dryBus ─┐
   water (pink) ─→  filter ─→ panner ─→ layerGain ─→ dryBus ─┤
   drone (osc)  ─→  filter ─→ panner ─→ layerGain ─→ dryBus ─┤
                                                              │
                     ┌──────── 一次性事件 ────────┐           │
                     │                            │           │
   bell  ─→ inharm partials ─→ filter ─→ panner ─→ eventBus ──┤
   guqin ─→ Karplus-Strong  ─→ filter ─→ panner ─→ eventBus ──┤
                                                              │
                                                              ▼
                                                         masterGain
                                                              │
                              ┌───────────────┬───────────────┤
                              │               │               │
                          reverbSend     dryGain           (直通)
                              │               │
                       ConvolverNode    →     │
                              │               │
                          reverbGain          │
                              │               │
                              └──────→ ◀──────┘
                                      │
                                  limiter（兜底防爆）
                                      │
                                  fadeGain（启停淡入淡出）
                                      │
                                  destination
```

**关键变化**：
1. 新增 `dryBus` / `eventBus` 两个汇总节点（仅做信号汇集，gain=1）
2. 新增 `reverbSend` / `ConvolverNode` / `reverbGain` 平行支路
3. 事件总线送混响的量比持续总线多 50%（钟和古琴需要更湿）
4. 新增 `limiter`（DynamicsCompressor）兜底防爆
5. 现有 `masterGain` / `fadeGain` 位置不变

---

## 4. Task A — 粉红噪声替换

### 4.1 为什么必须改

**白噪声**：所有频率能量相等。听感像电视雪花，高频压人耳。
**粉红噪声**：能量按 1/f 衰减，每个 octave 能量相等。听感像瀑布、风、雨——所有自然连续声的能量分布。
**人耳响度曲线**：粉红噪声主观上"每个频段同样响"，白噪声主观上"高频过亮"。

> **第一性原理**：自然 = 1/f noise。要做"禅意自然声"，载体必须是 1/f。

### 4.2 算法选型：Voss-McCartney（16-row）

为什么不选其他方案：
- **IIR 滤波白噪声**：CPU 高，质量受滤波器精度限制
- **FFT 频谱整形**：需要 OfflineAudioContext，复杂
- **Voss-McCartney**：N 个独立白噪声源按 2^n 周期更新求和，**O(1) 每样本**，质量足够好

**核心思想**：
- 维护 16 个寄存器 `rows[0..15]`
- 第 i 个寄存器每 `2^i` 个样本更新一次为新的随机值
- 输出 = `sum(rows) / N`
- 数学上输出谱在低频区精确 1/f，高频区有轻微平坦化（人耳无感知）

### 4.3 伪代码

```typescript
// 在 AudioEngine.ts 顶部新增 utility
function generatePinkNoise(length: number, sampleRate: number): Float32Array {
  const out = new Float32Array(length)
  const rows = new Float32Array(16)
  let runningSum = 0
  let counter = 0

  for (let i = 0; i < length; i++) {
    counter++
    // 用 counter 的最低位决定更新哪一行（标准 Voss-McCartney 技巧）
    const lowBit = counter & -counter           // 取最低 1 位
    const rowIndex = Math.log2(lowBit) | 0      // 该行的 index
    if (rowIndex < rows.length) {
      runningSum -= rows[rowIndex]
      rows[rowIndex] = Math.random() * 2 - 1
      runningSum += rows[rowIndex]
    }
    // 加一行不参与轮换的「白噪声层」，让最高频也保持自然
    const white = Math.random() * 2 - 1
    out[i] = (runningSum + white) / (rows.length + 1)
  }
  return out
}
```

### 4.4 风 vs 水的频率塑形

粉红噪声是"母音色"，再做 **octave-band 加权** 塑形风 / 水：

| 层 | 主能量频段 | 实现 |
|---|---|---|
| 风 | 200-1500 Hz（中低频为主，模拟空气在竹叶间） | 在 buffer 生成时，用一个 6dB/oct 低通形状 |
| 水 | 800-4000 Hz（中高频为主，模拟水流摩擦） | 在 buffer 生成时，用一个 3dB/oct 高通形状 |

**保留** 当前的"呼吸调制"：
```typescript
const breath = name === 'wind'
  ? 0.62 + 0.38 * Math.sin((i / sr) * 2 * Math.PI / 17 + Math.sin(i / sr / 11))
  : 0.82 + 0.18 * Math.sin((i / sr) * 2 * Math.PI / 9.5)
```
这是 BreezeScape 现有的好东西，**不要丢掉**。

### 4.5 文件改动清单

```
app/src/audio/AudioEngine.ts
  - 修改：getNoiseBuffer(name)
  - 新增：generatePinkNoise (file-level helper)
  - 新增：shapeForLayer(buffer, name) 做风/水的频率塑形

不动：其他所有方法
```

函数签名：**保持** `getNoiseBuffer(name: 'wind' | 'water'): AudioBuffer` 完全不变。

### 4.6 验收清单

**听感（戴耳机）**：
- [ ] 风：低频"咝咝感"明显减少，更像"空气流动"
- [ ] 水：高频不刺耳，更像远处溪流而非"嘶嘶气声"
- [ ] 连续听 10 分钟，没有耳朵发热的感觉

**自动验证**（写一个临时 `dev/spectrum.html` 用 AnalyserNode 验证）：
- [ ] FFT 谱在 100Hz-10kHz 区间，斜率约 -3 dB/oct（粉红特征）
- [ ] 不存在尖峰（不能有可见的谐振峰）

**回归**：
- [ ] `npm run build` 通过
- [ ] 切换三个 mode 正常
- [ ] 滑杆调整正常

### 4.7 风险与回滚

| 风险 | 概率 | 缓解 |
|---|---|---|
| 粉红噪声响度比白噪声高（积分能量大） | 高 | 在 `getLayerGain` 输出上整体 × 0.85 |
| Voss 算法在 buffer 边界处不连续 | 中 | buffer 长度设为 61 秒（与现有一致），loop 时人耳不察觉 |
| 移动端生成 61 秒 × 48kHz buffer 卡顿 | 低 | 用 OfflineAudioContext 离线生成，或在 init() 异步预生成 |

回滚：保留原 `getNoiseBuffer` 为 `getNoiseBufferLegacy`，通过 feature flag 切换：
```typescript
const USE_PINK_NOISE = true  // 出问题改 false
```

---

## 5. Task B — 寺钟非谐分音

### 5.1 为什么现在的钟不像钟

真实金属钟（梵钟、奥地利钟、Tibetan singing bowl）的振动模态**不是谐和**的。

物理学上，二维金属壳的振动是 Bessel 函数的根，比例为：

```
1.000, 2.000, 2.760, 5.404, 8.933, 13.345, ...
```

而当前代码用 `160 / 320 / 480` —— 这是 **1:2:3 谐和分音**，本质上和管风琴、合唱声的泛音结构相同，所以听起来"像和声"而不是"像钟"。

### 5.2 设计参数表

```typescript
// 6 个非谐分音模态
const BELL_PARTIALS = [
  { ratio: 1.000, decay: 10.0, amp: 1.00, attack: 0.30 },  // 基频，最长延音
  { ratio: 2.000, decay: 7.5,  amp: 0.42, attack: 0.25 },  // "勾音"
  { ratio: 2.760, decay: 4.2,  amp: 0.22, attack: 0.20 },  // 非谐！钟的标志
  { ratio: 5.404, decay: 2.5,  amp: 0.10, attack: 0.15 },  // 高泛音
  { ratio: 8.933, decay: 1.4,  amp: 0.05, attack: 0.10 },  // 撞击瞬态
  { ratio: 13.345, decay: 0.8, amp: 0.025, attack: 0.08 }, // 金属"叮"
]

// 基频范围：每次取一个不同的钟（避免完全相同）
const BELL_FUNDAMENTAL_RANGE: [number, number] = [135, 175]  // Hz

// 激发时序：模拟金属物理上各模态的"激发延迟"
// 不同模态在物理上不会同时被激发到峰值
const PARTIAL_START_JITTER_MS: [number, number] = [0, 15]
```

### 5.3 实现要点

```typescript
private synthBell(now: number, volume: number, pan: number): void {
  const ctx = this.ctx
  const fundamental = rand(BELL_FUNDAMENTAL_RANGE[0], BELL_FUNDAMENTAL_RANGE[1])

  // 共享滤波器：让所有分音过同一个 LPF，模拟金属外壳的低通行为
  const lpf = ctx.createBiquadFilter()
  lpf.type = 'lowpass'
  lpf.frequency.value = 2200   // 比原来的 800 高很多，让高频泛音透出来
  lpf.Q.value = 0.4

  const panner = ctx.createStereoPanner()
  panner.pan.value = pan

  lpf.connect(panner)
  // 注意：panner 接到 eventBus 而不是 masterGain（见 Task D）
  panner.connect(this.eventBus!)

  // 创建 6 个分音
  for (const partial of BELL_PARTIALS) {
    const startOffset = rand(0, 0.015)  // ≤ 15ms
    this.addBellPartial(
      lpf,
      fundamental * partial.ratio,
      volume * partial.amp,
      partial.attack,
      partial.decay,
      now + startOffset
    )
  }
}

private addBellPartial(
  dest: AudioNode,
  freq: number,
  amp: number,
  attack: number,
  decay: number,
  startTime: number,
): void {
  const ctx = this.ctx
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq

  const gain = ctx.createGain()
  // 必须从 0 线性渐起（永远不要 exponentialRamp from 0）
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(amp, startTime + attack)
  // 衰减用指数（自然声学衰减就是指数）
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + attack + decay)

  osc.connect(gain)
  gain.connect(dest)
  osc.start(startTime)
  osc.stop(startTime + attack + decay + 0.1)
}
```

### 5.4 调音建议

如果听起来：
- **太"金属"刺耳** → 把 partial 3-5 的 `amp` 各 × 0.7
- **太"闷"不像钟** → 把 LPF 频率从 2200 提到 3000
- **不够"重"** → 增加一个 ratio = 0.5（次谐波）的低音
- **听起来像 sine 合唱** → 检查是不是错误地把 ratio 用成了 [1,2,3,4,5]，确认非谐比例 [1, 2, 2.76, 5.4, ...]

### 5.5 听感验收

- [ ] 闭眼听，能脱口而出"这是钟" 而不是"这是 sine wave"
- [ ] 衰减自然，不在某个时刻突然消失
- [ ] 同模式连续触发 5 次，每次钟有微妙不同（基频不同）
- [ ] 配上 Task D 的混响后，有"山谷回声"感

---

## 6. Task C — Karplus-Strong 古琴

### 6.1 为什么 sine 做不出古琴

古琴的核心特征是**拨弦激发 + 弦本身的有限谐振 + 共鸣箱的过滤**。

Sine wave 没有"激发"，没有泛音，没有衰减谱演化。任你怎么调音色都做不出来。

**Karplus-Strong** 是 1983 年提出的拨弦合成算法，原理：
- 一个长度为 `N` 的延迟线（N = sampleRate / 频率）
- 起始时填入一段噪声 burst（模拟"拨"的瞬态）
- 把延迟线末端经过低通滤波 + 衰减系数后反馈回输入
- 输出延迟线读出端

物理意义：一段振动的弦，每次回到原点都损失一点能量、损失一点高频。这就是为什么真实弦音的高频比低频先死。

### 6.2 实现策略：用 AudioBuffer 离线渲染

由于 Web Audio API 没有原生 Karplus-Strong 节点，且我们不能用 AudioWorklet（INV-2），方案：

**用 JS 在 main thread 渲染一段 8 秒的 AudioBuffer，然后 BufferSourceNode 播放。**

每次触发古琴 → 渲染一个新 buffer（每个音都是"新"的，符合不重复原则）。
渲染 8 秒 × 48kHz = 384k samples，纯加减运算，< 30ms 完成。

### 6.3 算法核心代码

```typescript
function renderKarplusStrong(
  sampleRate: number,
  frequency: number,
  durationSec: number,
  decay: number,        // 反馈系数 0.985-0.998，越大延音越长
  lpfCoefficient: number, // 反馈环路低通强度 0-0.5
): Float32Array {
  const period = Math.max(2, Math.floor(sampleRate / frequency))
  const totalSamples = Math.floor(sampleRate * durationSec)
  const buffer = new Float32Array(totalSamples)

  // 1. 用噪声初始化延迟线（模拟"激发瞬态"）
  const delayLine = new Float32Array(period)
  for (let i = 0; i < period; i++) {
    delayLine[i] = Math.random() * 2 - 1
  }

  // 2. 用一个低通预处理初始 burst，让起音更"软"（不像电吉他那么硬）
  let prev = 0
  for (let i = 0; i < period; i++) {
    delayLine[i] = delayLine[i] * 0.5 + prev * 0.5
    prev = delayLine[i]
  }

  // 3. 主循环：读出 → LPF → 衰减 → 写回
  let readIdx = 0
  let lpfState = 0
  for (let i = 0; i < totalSamples; i++) {
    const current = delayLine[readIdx]
    buffer[i] = current

    // 一阶 IIR 低通：y[n] = (1-α)·x[n] + α·y[n-1]
    lpfState = current * (1 - lpfCoefficient) + lpfState * lpfCoefficient
    // 反馈回延迟线
    delayLine[readIdx] = lpfState * decay

    readIdx = (readIdx + 1) % period
  }

  return buffer
}
```

### 6.4 古琴专属参数

古琴的特点：
- **指甲挑弦**：激发偏柔，不是钢丝吉他那种"叮"
- **泛音点演奏**：经常在 1/2、1/3、1/4 弦长处弹，产生纯泛音
- **延音长**：丝弦古琴可延音 10+ 秒
- **音域低**：基频常在 100-300 Hz

```typescript
const GUQIN_PARAMS = {
  decay: 0.995,           // 长延音
  lpfCoefficient: 0.35,   // 中等低通：保留温暖感
  durationSec: 8,         // 8 秒足够
  initialBurstSoftness: 3, // 噪声 burst 预低通迭代次数，越大越柔
}

// 18% 概率叠一个泛音（1/2 点的音 = 高八度）
const HARMONIC_OVERTONE_PROB = 0.18
const HARMONIC_DELAY_RANGE: [number, number] = [1.3, 2.8]  // 秒
```

### 6.5 信号链

```
KarplusBuffer ─→ BufferSourceNode ─→ resonanceFilter ─→ panner ─→ eventBus
                                       (peaking)
```

新增一个 **peaking filter** 模拟古琴共鸣箱：
```typescript
const resonance = ctx.createBiquadFilter()
resonance.type = 'peaking'
resonance.frequency.value = 800    // 共鸣箱主谐振频率
resonance.Q.value = 1.2
resonance.gain.value = 4          // +4 dB 在 800Hz 处突出，更"木"
```

### 6.6 整体 synthGuqin 重写

```typescript
private synthGuqin(now: number, volume: number, pan: number): void {
  const ctx = this.ctx
  const freqs = getPentatonicFrequencies(this.scale)
  const baseFreq = freqs[Math.floor(Math.random() * freqs.length)]

  this.playGuqinNote(baseFreq, volume * 0.72, pan, now)

  if (Math.random() < HARMONIC_OVERTONE_PROB) {
    const secondFreq = freqs[Math.floor(Math.random() * freqs.length)]
    const delay = rand(HARMONIC_DELAY_RANGE[0], HARMONIC_DELAY_RANGE[1])
    this.playGuqinNote(secondFreq, volume * 0.34, pan, now + delay)
  }
}

private playGuqinNote(freq: number, amp: number, pan: number, startTime: number): void {
  const ctx = this.ctx
  const sr = ctx.sampleRate

  // 1. 离线渲染 Karplus-Strong
  const ksBuffer = renderKarplusStrong(sr, freq, 8, 0.995, 0.35)

  // 2. 包装到 AudioBuffer
  const audioBuffer = ctx.createBuffer(1, ksBuffer.length, sr)
  audioBuffer.copyToChannel(ksBuffer, 0)

  // 3. 构建播放图
  const source = ctx.createBufferSource()
  source.buffer = audioBuffer

  const resonance = ctx.createBiquadFilter()
  resonance.type = 'peaking'
  resonance.frequency.value = 800
  resonance.Q.value = 1.2
  resonance.gain.value = 4

  const panner = ctx.createStereoPanner()
  panner.pan.value = pan

  const gain = ctx.createGain()
  // 即便 KS 内部已经从 0 起，再加一个 50ms 软包络兜底
  gain.gain.setValueAtTime(0, startTime)
  gain.gain.linearRampToValueAtTime(amp, startTime + 0.05)
  // 不需要手动 decay，KS 自己会衰减

  source.connect(resonance)
  resonance.connect(panner)
  panner.connect(gain)
  gain.connect(this.eventBus!)

  source.start(startTime)
}
```

### 6.7 听感验收

- [ ] 起音有"触弦"感而非"出现"感
- [ ] 衰减过程中高频先死、低频后死（自然弦音特征）
- [ ] 连续 5 次同一调，音色有微妙差异（每次随机初始 burst）
- [ ] 不出现金属嗡鸣（如果有，把 decay 从 0.995 降到 0.99）
- [ ] 在静音环境下听，能听到非常远的延音尾巴

### 6.8 性能验证

- [ ] 单次渲染 8 秒 buffer 耗时 < 30ms（在 iPhone 12 上）
- [ ] 触发古琴时不卡顿，没有音频 dropout

如果性能不达标，回退方案：**生成 8 个预渲染古琴 buffer（每个五声音阶音一个），缓存复用，加随机起音偏移**。会略微降低多样性但保证流畅。

---

## 7. Task D — 卷积混响总线

### 7.1 为什么需要混响

BreezeScape 现有声景是**完全干**的。所有声音直接打到耳膜，听起来像在录音棚而不是在山谷里。

**真实的"远山寺钟"** 的核心特征不是钟的音色，而是**钟声穿越空气、撞击山壁、回到你耳朵的混响轨迹**。

> **第一性原理**：你听到的不是钟，是"钟 + 山谷 + 空气"。少了后两者，禅意立刻塌掉。

### 7.2 混响的两种实现路径

| 方案 | 优点 | 缺点 |
|---|---|---|
| **算法混响**（Schroeder / FDN） | CPU 低，参数可控 | 难调到"自然"，容易像 80 年代电子琴 |
| **卷积混响**（ConvolverNode + IR） | 极度真实，浏览器原生支持 | 需要 IR 文件 **或** 算法生成 IR |

**选定：算法生成 IR + ConvolverNode**。结合两者优点，不依赖外部音频文件。

### 7.3 IR 设计（"远山空谷"）

```
特征：
- 总长度：6 秒
- 双声道，且左右去相关（产生空间宽度）
- 衰减形状：指数 + 微小随机扰动
- 前 80ms 静默或极弱（远场感 / pre-delay）
- 高频衰减比低频快 1.5×（空气吸收）
- 0.4-2 秒区域略有"密度"（早期反射）
```

### 7.4 IR 生成算法

```typescript
function generateMountainValleyIR(
  ctx: BaseAudioContext,
  durationSec: number = 6,
): AudioBuffer {
  const sr = ctx.sampleRate
  const length = Math.floor(sr * durationSec)
  const ir = ctx.createBuffer(2, length, sr)

  for (let ch = 0; ch < 2; ch++) {
    const data = ir.getChannelData(ch)
    const preDelaySamples = Math.floor(sr * 0.08)  // 80ms pre-delay

    for (let i = 0; i < length; i++) {
      if (i < preDelaySamples) {
        // pre-delay 区，极弱
        data[i] = (Math.random() * 2 - 1) * 0.002
        continue
      }

      const t = (i - preDelaySamples) / sr
      const totalT = durationSec - 0.08

      // 主衰减：指数
      const envelope = Math.exp(-3.0 * t / totalT)

      // 噪声基底
      const noise = Math.random() * 2 - 1

      // 早期反射密度：0.4-2 秒区有少量"颗粒感"
      const earlyReflection = (t > 0.4 && t < 2.0 && Math.random() < 0.015)
        ? (Math.random() * 2 - 1) * 0.3
        : 0

      data[i] = (noise * envelope + earlyReflection) * 0.5
    }

    // 后处理：时变低通（高频随时间衰减更快，模拟空气吸收）
    let lpfState = 0
    for (let i = 0; i < length; i++) {
      const t = i / sr
      const alpha = 0.05 + (t / durationSec) * 0.3
      lpfState = data[i] * (1 - alpha) + lpfState * alpha
      data[i] = lpfState
    }
  }

  // 左右声道用不同随机种子（上面已经做了），自然去相关

  return ir
}
```

### 7.5 信号链改动

在 `AudioEngine.init()` 中：

```typescript
init(): void {
  if (this.ctx) return
  this.ctx = new AudioContext()

  // —— 输出链（保持） ——
  this.fadeGain = this.ctx.createGain()
  this.fadeGain.gain.value = 0
  this.fadeGain.connect(this.ctx.destination)

  // —— 新增：limiter 兜底防爆 ——
  this.limiter = this.ctx.createDynamicsCompressor()
  this.limiter.threshold.value = -6
  this.limiter.knee.value = 2
  this.limiter.ratio.value = 8
  this.limiter.attack.value = 0.003
  this.limiter.release.value = 0.25
  this.limiter.connect(this.fadeGain)

  this.masterGain = this.ctx.createGain()
  this.masterGain.gain.value = this._masterVolume
  this.masterGain.connect(this.limiter)

  // —— 新增：混响支路 ——
  this.convolver = this.ctx.createConvolver()
  this.convolver.normalize = true
  // 异步生成 IR，避免阻塞 init
  queueMicrotask(() => {
    this.convolver!.buffer = generateMountainValleyIR(this.ctx!, 6)
  })

  this.reverbGain = this.ctx.createGain()
  this.reverbGain.gain.value = 0.25  // 默认 wet 量
  this.convolver.connect(this.reverbGain)
  this.reverbGain.connect(this.masterGain)

  // —— 新增：两个汇总总线 ——
  this.dryBus = this.ctx.createGain()
  this.eventBus = this.ctx.createGain()

  this.dryBus.connect(this.masterGain)        // 干路直接到 master
  this.eventBus.connect(this.masterGain)      // 事件干路到 master

  // 各自有 reverbSend
  this.drySend = this.ctx.createGain()
  this.drySend.gain.value = 1.0
  this.dryBus.connect(this.drySend)
  this.drySend.connect(this.convolver)

  this.eventSend = this.ctx.createGain()
  this.eventSend.gain.value = 1.5  // 事件比持续层多 50% 湿
  this.eventBus.connect(this.eventSend)
  this.eventSend.connect(this.convolver)
}
```

### 7.6 重要：处理现有层的连接

`createNoiseLayer` / `createDroneLayer` 的末端 `gain.connect(this.masterGain)` 必须改成 `gain.connect(this.dryBus)`。

`OneShotPlayer` 构造函数原来接收 `masterGain`，现在改成接收 `eventBus`：

```typescript
// AudioEngine.ts play() 中：
this.oneShotPlayer = new OneShotPlayer(ctx, this.eventBus!)
```

### 7.7 setReverbWet API

```typescript
setReverbWet(value: number): void {
  this._reverbWet = clamp(value)
  const drySendValue = 0.5 + this._reverbWet * 1.5    // 持续层 send
  const eventSendValue = 0.8 + this._reverbWet * 2.5  // 事件层 send（更湿）
  if (this.ctx) {
    this.drySend!.gain.setTargetAtTime(drySendValue, this.ctx.currentTime, 0.1)
    this.eventSend!.gain.setTargetAtTime(eventSendValue, this.ctx.currentTime, 0.1)
  }
}
```

**spatialLevel 滑杆联动**：在 `setSpatialLevel` 内自动调 reverbWet：

```typescript
setSpatialLevel(value: number): void {
  this._spatialLevel = clamp(value)
  // ...原有代码...
  this.setReverbWet(value * 0.7 + 0.15)  // 范围 0.15-0.85
}
```

### 7.8 mode preset 增加 reverbWet 字段

```typescript
// soundscapes.ts EnginePreset 增加：
reverbWet: number   // 0-1

// 各 mode：
meditate: { ..., reverbWet: 0.45 },  // 中等空间
sleep:    { ..., reverbWet: 0.65 },  // 最远、最空
focus:    { ..., reverbWet: 0.25 },  // 较干，让人保持清醒
```

### 7.9 听感验收

- [ ] 钟声有明显尾韵，能听到 3-5 秒的回响
- [ ] 古琴的延音和混响融合自然，不"糊"
- [ ] 风、水有"在某个空间里"的感觉而非"贴耳"
- [ ] 切换 mode 时混响湿度有可感知差异
- [ ] CPU 增量 < 4%

### 7.10 风险与回滚

| 风险 | 缓解 |
|---|---|
| ConvolverNode 在某些移动浏览器 CPU 高 | 提供 `setReverbBypass(true)` 用于低端设备 |
| 6 秒 IR 占内存 ~3 MB | 可接受，单次生成不重复 |
| 多个事件叠加混响后峰值过响 | 已加 limiter 兜底（见 7.5） |

---

## 8. 联调与回归测试

### 8.1 集成测试矩阵

| 测试用例 | 预期 |
|---|---|
| 启动 meditate 模式 30 秒 | 听到风+水+drone，无 click，无爆音 |
| 触发 5 次钟（修改 scheduler 调高概率临时验证） | 每次钟略不同，有混响尾韵 |
| 触发 5 次古琴 | 每次拨弦感不同，无嗡鸣 |
| meditate → sleep → focus 三次切换 | 各种参数平滑过渡，无杂音 |
| 滑杆 spatialLevel 从 0 拉到 1 | 混响湿度可感知变化 |
| 连续播放 30 分钟 | 内存稳定，CPU 稳定，无 dropout |
| Safari iOS 上启动 | 第一次点击后能播放，无延迟 |
| 切换标签页 10 分钟回来 | 声景仍在，没有累积偏移 |

### 8.2 自动化烟雾测试（可选，强烈推荐）

写一个 `dev/smoke-test.html`：
```html
<script type="module">
  import { audioEngine } from '../app/src/audio/AudioEngine.ts'

  async function smokeTest() {
    audioEngine.init()
    await audioEngine.play()
    // 记录 30 秒内的 AnalyserNode 数据
    // 验证：RMS 在合理范围，无 NaN，无 -Infinity
  }
</script>
```

---

## 9. 性能预算与监控

| 指标 | 预算 | 测量方法 |
|---|---|---|
| 启动到首声 | < 500 ms | `performance.now()` 在 play() 前后 |
| 持续 CPU（中端手机） | < 8% | Chrome DevTools Performance |
| 内存峰值 | < 35 MB | DevTools Memory snapshot |
| Buffer 生成（粉红噪声） | < 200 ms | 在 init() 中 console.time |
| IR 生成 | < 100 ms | 在 init() 中 console.time |
| 古琴单次渲染 | < 30 ms | 在 synthGuqin 中 console.time |

**注意**：测量完后所有 `console.time` 必须移除（INV-6）。

---

## 10. Codex 执行手册

### 10.1 任务顺序（绝对不能乱）

```
Day 1: Task A（粉红噪声）  ─ 风险最低，影响最广
       ↓ commit
Day 2: Task D（混响总线）  ─ 必须先于 B、C，因为它们要接 eventBus
       ↓ commit
Day 3: Task B（非谐钟）
       ↓ commit
Day 4-5: Task C（Karplus-Strong）
       ↓ commit
Day 6: 联调 + 调音 + 性能验证
       ↓ commit
Day 7: 写发布说明，部署到 GitHub Pages
```

### 10.2 给 Codex 的开场白模板

```
你正在 shadowxx789/zenscape 项目工作。
本次 Sprint 的完整规格在 docs/SPRINT_1_SPEC.md。

我现在要做 Task [A/B/C/D]。请：
1. 先读 docs/SPRINT_1_SPEC.md 第 [4/5/6/7] 节
2. 读相关源文件：app/src/audio/AudioEngine.ts 等
3. 列出你计划的修改点（diff 摘要），不要直接写代码
4. 等我确认后再实施
5. 实施后给出"听感验收清单"对应的修改自验报告

绝对不能违反 docs/SPRINT_1_SPEC.md 第 2.2 节的全局不变量。
```

### 10.3 每个 Task 完成后的 commit message 规范

```
feat(audio): [Task A] replace white noise with Voss-McCartney pink noise

- Add generatePinkNoise() with 16-row Voss algorithm
- Add shapeForLayer() for wind/water octave-band weighting
- Preserve breath modulation
- API unchanged

Verified:
- [ ] FFT slope ≈ -3 dB/oct on wind layer
- [ ] No clicks at loop boundary
- [ ] All 3 modes play correctly
- [ ] npm run build passes
```

---

## 11. Sprint 1 完成后的听感 Demo Session

向自己演示用：

> 戴上头戴式耳机（不是 AirPods），关灯。
>
> 1. 选 **meditate**，时长 5 分钟，开始
> 2. 闭眼，**不要看屏幕**
> 3. 听 30 秒，问自己："这像不像我在山里？"
> 4. 等第一声钟响起（约 1-2 分钟内），问自己："这像不像远处寺钟？"
> 5. 等第一声古琴，问自己："这像不像有人在很远处拨了一下弦？"
> 6. 切到 **sleep**，问自己："是不是更暗、更远、更软？"
> 7. 切到 **focus**，问自己："是不是更近、更干、更清醒？"

如果以上 7 个问题中有 ≥ 6 个答案是"是"，**Sprint 1 通过**。

如果有 ≥ 3 个答案是"否"，回到调音环节，**不要进入 Sprint 2**。

---

## 12. Sprint 1 完成后的下一步

→ 见 `docs/ROADMAP.md` 第 5 节（Sprint 2：Endel 化响应式输入）。

Sprint 1 是地基。地基不牢，上面盖什么都是危房。

---

*文档结束*
*"声声不住，念念不停。"*
