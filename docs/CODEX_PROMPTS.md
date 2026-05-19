# BreezeScape Sprint 1 — Codex Prompt 集合

> **开箱即用的提示词**
> Version 1.0 · 2026-05-17 · 配合 `docs/SPRINT_1_SPEC.md` 使用

---

## 0. 怎么用这份文档

每个 Task 提供 **3 个层级** 的 prompt：

| 层级 | 用途 | 何时用 |
|---|---|---|
| **L1：规划 Prompt** | 让 Codex 先列出 diff 摘要，不写代码 | 每个 Task 第一步，避免一上来就改大量代码 |
| **L2：实施 Prompt** | 让 Codex 实际写代码 | 你确认 L1 的规划合理后 |
| **L3：自验 Prompt** | 让 Codex 跑听感/性能验收 | 实施完成后，commit 之前 |

**铁律**：永远先 L1，再 L2，再 L3。**不要跳过 L1**。跳过的代价是 Codex 一上来动 200 行代码，你 review 不过来。

---

## 1. 通用元提示词（每次开 Codex 会话第一句话）

```
你正在 shadowxx789/zenscape 项目工作。

项目背景：禅意生成式冥想声景 Web/PWA，React 19 + TS + Web Audio API。

请先阅读以下两份文档建立上下文：
1. docs/ROADMAP.md（项目全景）
2. docs/SPRINT_1_SPEC.md（本 Sprint 施工图）

绝对不能违反的不变量（见 SPRINT_1_SPEC 第 2.2 节）：
- INV-1: 外部 API 不变（SessionView.tsx 不需要改）
- INV-2: 不依赖 AudioWorklet
- INV-3: 不引入任何新 npm 依赖
- INV-4: 无 click、无爆音；attack 从 0 线性渐起 ≥ 50ms
- INV-5: CPU < 8%，内存增量 < 25 MB
- INV-6: 不写 console.log，不写无意义注释（但声学原理注释必须有）
- INV-7: 每个 Task 一个 PR，单独可 revert

工作流程：
1. 我先发"规划 prompt"，你只列 diff 摘要，不写代码
2. 我确认后发"实施 prompt"，你写代码
3. 你完成后我发"自验 prompt"，你跑验收并报告
4. 我决定是否 commit

我准备好后会说"开始 Task X"。在那之前请只回复"已阅读规格，准备就绪"。
```

---

## 2. Task A — 粉红噪声替换

### 2.1 L1 规划 Prompt

```
开始 Task A（粉红噪声替换）。

请先：
1. 读 docs/SPRINT_1_SPEC.md 第 4 节（Task A 全文）
2. 读 app/src/audio/AudioEngine.ts 当前的 getNoiseBuffer 方法
3. 列出你的 diff 摘要：
   - 计划新增哪些 file-level helper 函数
   - 计划修改 getNoiseBuffer 的哪些行
   - 计划新增的 USE_PINK_NOISE feature flag 放在哪
   - 是否需要修改 getLayerGain（响度补偿 × 0.85）

输出格式：
- 文件路径
- 改动类型（新增 / 修改 / 删除）
- 大致行数
- 关键设计决策的简短说明

只列规划，不写代码。等我确认。
```

### 2.2 L2 实施 Prompt

```
规划通过。请实施 Task A。

要求：
1. 严格按规格 4.3 节的伪代码实现 generatePinkNoise（16-row Voss-McCartney）
2. 严格按规格 4.4 节实现 shapeForLayer（风用 6dB/oct 低通形状，水用 3dB/oct 高通形状）
3. 保留现有的 breath 调制（17 秒 / 9.5 秒周期）
4. 加 USE_PINK_NOISE = true 常量在文件顶部
5. 保留旧实现为 getNoiseBufferLegacy（供回滚）
6. 响度补偿：在 getLayerGain 输出上整体 × 0.85（粉红噪声积分能量更大）
7. 注释只解释"为什么 1/f"，不解释"这是 for 循环"

完成后告诉我：
- 改了哪几个文件
- 总共多少行 diff
- 是否触发任何 lint warning
```

### 2.3 L3 自验 Prompt

```
跑 Task A 自验：

1. 运行 npm run build，报告是否通过
2. 启动 npm run dev，在浏览器里：
   a. 点击开始播放，验证无 click、无爆音
   b. 切换 meditate → sleep → focus，验证全部正常
   c. 拖动 natureLevel 滑杆，验证平滑变化
3. 写一个临时 dev/spectrum-test.html：
   - 加载 AudioEngine
   - 用 AnalyserNode 抓取 wind 层的 FFT
   - 在 console 输出 100Hz / 1kHz / 10kHz 的能量
   - 验证斜率约 -3 dB/oct
4. 在 Chrome DevTools Performance 里录一段 30 秒播放，报告 CPU 占用

不要 commit。把测试结果给我，我决定是否通过。
```

---

## 3. Task D — 卷积混响总线

> **注意**：必须先做 Task D，再做 B 和 C。因为 B 和 C 要接 eventBus，eventBus 是 Task D 引入的。

### 3.1 L1 规划 Prompt

```
开始 Task D（卷积混响总线）。

请先：
1. 读 docs/SPRINT_1_SPEC.md 第 7 节（Task D 全文）
2. 读 app/src/audio/AudioEngine.ts 当前的 init() 和 play()
3. 读 app/src/audio/OneShotPlayer.ts 的构造函数
4. 读 app/src/audio/soundscapes.ts 的 EnginePreset

列出 diff 摘要：
   - AudioEngine.ts: 新增哪些字段（dryBus / eventBus / convolver / reverbGain / drySend / eventSend / limiter）
   - AudioEngine.ts: init() 改动
   - AudioEngine.ts: createNoiseLayer / createDroneLayer 末端连接改动
   - AudioEngine.ts: play() 里 oneShotPlayer 构造参数改动
   - AudioEngine.ts: 新增 setReverbWet() / setSpatialLevel() 联动
   - AudioEngine.ts: dispose() 必须新增清理逻辑
   - OneShotPlayer.ts: 构造函数参数从 masterGain 改 eventBus
   - soundscapes.ts: 三个 mode 各加 reverbWet 字段
   - 新增 utility: generateMountainValleyIR

特别注意：
- IR 生成必须 queueMicrotask 异步，不阻塞 init
- limiter 必须串在 masterGain → fadeGain 之间
- dispose 必须 disconnect 所有新增节点

只列规划。
```

### 3.2 L2 实施 Prompt

```
规划通过。请实施 Task D。

严格按规格 7.4-7.8 的代码实现。

补充要求：
1. ConvolverNode.normalize = true
2. 默认 reverbGain.gain.value = 0.25
3. drySend.gain.value 默认 1.0（持续层）
4. eventSend.gain.value 默认 1.5（事件层，多 50% 湿）
5. limiter 参数严格按规格 7.5：threshold -6, knee 2, ratio 8, attack 0.003, release 0.25
6. setSpatialLevel 联动公式：reverbWet = spatialLevel * 0.7 + 0.15
7. 在 setMode 时把 reverbWet 应用为当前 mode 的 preset.reverbWet（如果用户没手动覆盖）

最关键的兼容性：
- play() 不能因为 IR 还没生成就报错（异步生成期间，convolver.buffer 可能为 null，要容错）
- dispose() 顺序：先 stopImmediate → disconnect 新节点 → 关 ctx

完成后告诉我：
- 改了哪些文件
- IR 生成耗时（用 performance.now 测一次，测完删掉）
- limiter 启用前后峰值差（如果你能测）
```

### 3.3 L3 自验 Prompt

```
跑 Task D 自验：

1. npm run build 通过
2. npm run dev 后：
   a. 启动 meditate，听 30 秒。验证：
      - 风/水有"在某个空间里"感（而非贴耳）
      - 没有任何 click 或 dropout
   b. 切到 sleep。验证混响明显比 meditate 湿（preset 0.65 vs 0.45）
   c. 切到 focus。验证混响明显比 meditate 干（preset 0.25 vs 0.45）
   d. 拖动 spatialLevel 从 0 到 1。验证混响湿度平滑变化
3. 临时把 scheduler 的 bellProbability 调到 0.5（强制频繁触发钟），听 5 次钟：
   - 每次钟有 3-5 秒尾韵
   - 没有累积爆音（limiter 在工作）
4. Performance 录制 30 秒，报告：
   - CPU 占用（基线应 < 12%，因为加了 convolver）
   - 内存增量（IR 占约 3 MB）

不要 commit。
```

---

## 4. Task B — 寺钟非谐分音

### 4.1 L1 规划 Prompt

```
开始 Task B（寺钟非谐分音）。

前置条件：Task D 已合并，eventBus 已存在。

请先：
1. 读 docs/SPRINT_1_SPEC.md 第 5 节（Task B 全文）
2. 读 app/src/audio/OneShotPlayer.ts 当前的 synthBell 和 addBellTone

列出 diff 摘要：
   - 新增的常量：BELL_PARTIALS（6 个非谐模态）、BELL_FUNDAMENTAL_RANGE、PARTIAL_START_JITTER_MS
   - synthBell 改动：从 3 个谐和分音改为 6 个非谐分音
   - addBellTone → addBellPartial 重命名（如有必要）
   - LPF 频率从 800 改到 2200
   - 新增基频随机化（135-175 Hz）
   - 新增各分音 startOffset jitter

只列规划。
```

### 4.2 L2 实施 Prompt

```
规划通过。实施 Task B。

严格按规格 5.2-5.3 实现。

关键技术点：
1. 6 个分音的 ratio 必须是非谐：[1.000, 2.000, 2.760, 5.404, 8.933, 13.345]
2. 每个分音独立 attack（不同）、独立 decay（不同）、独立 amp（不同）
3. 各分音 startTime 错开 0-15ms
4. attack 从 0 线性渐起（不要 exponentialRamp from 0）
5. decay 用 exponentialRampToValueAtTime（自然衰减）
6. 共享一个 LPF + 一个 panner（性能优化）
7. 接到 this.eventBus（不是 masterGain）

完成后报告：
- 改动行数
- 每次钟创建的 oscillator 数量（应该是 6）
- 是否每次钟基频都不同
```

### 4.3 L3 自验 Prompt

```
跑 Task B 自验：

1. npm run build 通过
2. 临时调高 bellProbability 到 0.3，启动 meditate，听 10 次钟：
   a. 闭眼，能脱口而出"这是钟"而不是"sine wave 合唱"
   b. 衰减自然，不突然消失
   c. 每次钟基频明显不同
   d. 配合混响有"远山回声"感
3. 切到三个 mode 各听 3 次钟，验证：
   - meditate: 中等明亮
   - sleep: 偏暗、更远
   - focus: 偏亮、清晰
4. 连续触发 10 次（密集测试），验证 limiter 不让总响度失控

报告听感主观分（1-10），并附 1 句话描述。
```

---

## 5. Task C — Karplus-Strong 古琴

### 5.1 L1 规划 Prompt

```
开始 Task C（Karplus-Strong 古琴）。

前置条件：Task D 已合并。

请先：
1. 读 docs/SPRINT_1_SPEC.md 第 6 节（Task C 全文）
2. 读 app/src/audio/OneShotPlayer.ts 当前的 synthGuqin 和 addGuqinTone

列出 diff 摘要：
   - 新增 file-level helper: renderKarplusStrong(sr, freq, dur, decay, lpfCoef)
   - 新增常量: GUQIN_PARAMS、HARMONIC_OVERTONE_PROB、HARMONIC_DELAY_RANGE
   - synthGuqin 重写：调用 playGuqinNote
   - 新增 playGuqinNote 私有方法
   - 删除旧的 addGuqinTone（或保留为 legacy）
   - peaking filter（共鸣箱模拟）放在哪个位置

性能关键问题：
- 单次 renderKarplusStrong 需要 < 30ms。请说明你打算如何确保不阻塞主线程
- 是否需要预渲染缓存方案（fallback）

只列规划。
```

### 5.2 L2 实施 Prompt

```
规划通过。实施 Task C。

严格按规格 6.3-6.6 实现。

关键技术点：
1. renderKarplusStrong 算法：延迟线 + IIR 低通反馈
2. 初始 burst 必须预低通（让起音柔，不像电吉他）
3. decay = 0.995（长延音）, lpfCoefficient = 0.35
4. durationSec = 8（够长）
5. 包装到 AudioBuffer 用 copyToChannel
6. peaking filter: 800Hz, Q=1.2, gain=4dB
7. 即便 KS 内部从 0 起，再加 50ms 软包络兜底
8. 接到 this.eventBus

性能要求：
- 如果单次渲染 > 30ms，请改用预渲染方案（每个五声音阶预渲染 1 个，启动时一次性生成）
- 预渲染方案需要 8 个 buffer × ~1.5MB = 12MB 内存，可接受

完成后报告：
- 实际单次渲染耗时
- 是否走了预渲染 fallback
- 改动行数
```

### 5.3 L3 自验 Prompt

```
跑 Task C 自验：

1. npm run build 通过
2. 临时调高 pluckProbability 到 0.3，启动 meditate，听 10 次古琴：
   a. 起音有"触弦"感，不是"出现"感
   b. 衰减过程中高频先死、低频后死
   c. 不出现金属嗡鸣
   d. 配合混响延音尾巴长
3. 切到 sleep（G 宫），验证音调换了
4. 切到 focus（D 宫），验证音调又换了
5. 连续触发 20 次（密集测试），验证：
   - 没有累积失真
   - 没有 dropout
   - CPU 不持续上升（说明 BufferSource 正确释放）
6. 用 DevTools Memory 在触发前和触发 20 次后各拍一张 snapshot，验证内存无泄漏

报告主观分 + 客观指标。
```

---

## 6. 联调测试 Prompt

实施完 A + D + B + C 之后：

```
4 个 Task 都已实施。请跑完整联调：

测试矩阵（来自 SPRINT_1_SPEC 第 8.1 节）：

1. 启动 meditate 30 秒：风+水+drone 听得清，无 click
2. 强制触发 5 次钟 + 5 次古琴：都正常，混响合理
3. meditate → sleep → focus → meditate 切换 3 轮：参数平滑过渡
4. spatialLevel 从 0 拉到 1 再回 0：混响平滑变化
5. 连续播放 30 分钟：
   - 内存稳定（snapshot 前后差 < 5 MB）
   - CPU 稳定（无持续上升）
   - 无 dropout
6. Safari iOS 上启动：首次点击后 < 1s 出声
7. 切换标签页 10 分钟回来：无累积偏移

每条测试给出 ✅/⚠️/❌，附 1 句话说明。

最后做规格第 11 节的"听感 Demo Session"，回答 7 个问题。

如果 ≥ 6 个 ✅ 且 Demo Session ≥ 6 个"是"，Sprint 1 通过。
```

---

## 7. 发布 Prompt

Sprint 1 通过后：

```
Sprint 1 通过，准备发布。

请：
1. 更新 README.md 的「里程碑」表，增加：
   | Sprint 1 | 粉红噪声 + 非谐钟 + Karplus 古琴 + 卷积混响 | ✅ |
2. 在 README.md 顶部加一句 changelog：
   "v0.2 — Sprint 1：声音质量升级（2026-05-XX）"
3. 写发布说明 docs/RELEASE_NOTES_v0.2.md，包括：
   - 改了什么（用户视角，1 段话）
   - 听感前后对比（如果有 demo）
   - 技术细节（开发者视角，3-5 个 bullet）
   - 已知问题
4. 部署：npm run build && 提交 dist/ 到 gh-pages 分支
5. 验证 https://shadowxx789.github.io/zenscape/ 上的新版本能正常播放

不要做：
- 不要写"AI 生成"或"Codex 协助"之类的话
- 不要写性能数字（除非已经在真机上测过）
- 不要承诺下个 Sprint 时间
```

---

## 8. 应急 Prompt

### 8.1 出现爆音/click

```
紧急：[描述现象，如 "钟声触发时有明显 click"]

请按以下顺序排查：
1. 检查最近改动里是否有任何 attack 用 exponentialRampToValueAtTime from 0
   （这是 99% 的 click 来源）
2. 检查所有 oscillator.start(now) 是否改成了 start(now + 0.05)
3. 检查 gain.gain.setValueAtTime(0, now) 是否在 oscillator.start 之前
4. 检查 limiter 是否在工作（threshold -6 是否够）

定位问题，给出最小修复 patch。不要重写大段代码。
```

### 8.2 CPU 飙高

```
紧急：CPU 占用 [X]%，超出预算 8%。

请按以下顺序排查：
1. 是否每次事件触发都在创建新 ConvolverNode？（应该只有一个共享）
2. renderKarplusStrong 是否在主线程同步执行 > 30ms？
3. 是否有 setTimeout 频率过高（< 100ms 的 tick）？
4. 持续层 oscillator/buffer 是否在 stop 后正确 disconnect？

用 Performance Profiler 录一段，截图分析。给出修复方案。
```

### 8.3 听感不对

```
听感问题：[具体描述，如 "钟声听起来还是像 sine 不像钟"]

请按以下顺序排查（针对钟的例子）：
1. 确认 BELL_PARTIALS 的 ratio 是非谐 [1, 2, 2.76, 5.4, 8.93, 13.34]
   而不是谐和 [1, 2, 3, 4, 5, 6]
2. 确认每个分音 amp 衰减递减（基频最响，高泛音很弱）
3. 确认 decay 各不相同（基频最长，高泛音最短）
4. 确认 LPF 频率 ≥ 2200（不能太闷）
5. 确认基频在 135-175 Hz 范围内随机

如果以上都对，提供 3 个调音建议（比如调整 amp 分布、LPF Q 值等）。
```

---

## 9. 文档导航速查

| 我想做 | 看哪份文档 |
|---|---|
| 了解整个项目的方向 | `docs/ROADMAP.md` |
| 了解 Sprint 1 的施工细节 | `docs/SPRINT_1_SPEC.md` |
| 给 Codex 发指令 | 本文档（你正在看的） |
| 看 MVP 历史规格 | `APP_SPEC.md` / `SOUND_SPEC.md` |
| 看任务清单 | `TASKS.md` |

---

## 10. 给自己的提醒

1. **永远先 L1 规划**，不要让 Codex 一上来就写代码
2. **每个 Task 一个 PR**，方便回滚
3. **听感主观分必须自己听**，不能让 Codex 替你判断
4. **遇到 Codex 想"重构整个模块"时立刻打断**，回到本文档的具体 Task
5. **如果 Codex 反复改不对**，回到 `SPRINT_1_SPEC.md` 把原始规格再贴一遍给它

---

*"工欲善其事，必先利其器。Codex 是器，spec 是事。"*
