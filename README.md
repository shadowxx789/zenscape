# 竹间息 BreezeScape

> 竹间息 BreezeScape——风过竹林，声声不住，念念不停。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen)](https://shadowxx789.github.io/zenscape/)
[![Tech](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Tech](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tech](https://img.shields.io/badge/Web%20Audio%20API-native-FF6F00)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

## 偈

```
风从何处来，水向何处去。
不觅声来处，声声皆自渡。
钟落空山寂，琴收万壑虚。
即心是净土，何须问归途。
```

---

## 📐 项目导航

| 文档 | 用途 |
|---|---|
| 🗺️ [docs/ROADMAP.md](docs/ROADMAP.md) | 开发战略总览（6 个 Sprint） |
| 🔧 [docs/SPRINT_1_SPEC.md](docs/SPRINT_1_SPEC.md) | Sprint 1 施工图（声音质量升级） |
| 🤖 [docs/CODEX_PROMPTS.md](docs/CODEX_PROMPTS.md) | Codex 开箱即用提示词集合 |
| 📜 [APP_SPEC.md](APP_SPEC.md) | MVP 规格（历史档案） |
| 🔊 [SOUND_SPEC.md](SOUND_SPEC.md) | 声音规格（历史档案） |
| ✅ [TASKS.md](TASKS.md) | M0-M7 任务（已完成） |

---

## 什么是竹间息

竹间息是一个生成式冥想声景应用。不是播放列表，不是白噪声合集——它在你的浏览器里实时合成一片永远不会重复的声音空间：风过竹林、水流溪涧、远处的钟、偶尔的古琴泛音。五层声音各自呼吸、各自生长，像一座会变化的山。

你不需要做任何事。选一个模式，选一个时长，闭上眼睛。

声音会自己走。

**→ [在线体验](https://shadowxx789.github.io/zenscape/)**

---

## 三个模式

每个模式有独立的声景预设（音量、滤波、声像、音阶、事件密度全部独立调校）：

| 模式 | 意图 |
|------|------|
| 静坐 | 松沉、内观。声音从四周慢慢收拢，密度渐低，留白渐多。C 宫五声。 |
| 入睡 | 暗色、包裹。低频为主，钟声极远，像雨落在很远的地方。G 宫五声。 |
| 专注 | 清醒但不紧绷。持续的环境底噪维持注意力，偶有亮色点缀。D 宫五声。 |

---

## 声音设计

五层声音，不是音轨，是活的参数流：

- **风** — 竹林风声，长循环，是整片声景的呼吸
- **水** — 溪流细雨，轻而持续，不抢注意力
- **低频** — 合成的持续低音，温和，无压迫感。非线性增益曲线，滑杆拉到底仍有底声托住空间
- **钟** — 远寺钟声，极稀疏，像从山那边飘过来的
- **古琴** — 泛音单音，偶尔一响，不形成旋律。基于五声音阶（C/D/G 宫可选）

每个声音层的音量、频率、空间位置都由规则引擎实时驱动，跟随会话阶段（入定 → 安住 → 深境 → 回转）缓慢变化。钟声和古琴由概率触发——你永远不知道下一响是什么时候。

每个模式有独立的 `EnginePreset`（风/水/Drone 增益、滤波、声像、混响比例）+ `SchedulerParams`（事件密度、最小间隔、首次延迟）+ `SoundParams`（五维滑杆），三层预设协同工作。

### 混响

卷积混响，脉冲响应不是从库里拿的——是手写的山间模型：6 秒衰减、80ms 预延迟、低频更暗、带早期反射。三个模式的混响湿度各不相同（静坐 45%、入睡 65%、专注 25%），事件通道（钟/琴）的发送量高于环境层。

信号链现在是并行的：环境层和事件层各走一条 dry bus 进 master，同时通过独立的 send 节点送进同一个 convolver 再汇回 master，进 limiter 后才到淡入总线。不爆音，不打架。

空间感滑杆统一控制声像与混响湿度——切换模式时 pan 和 reverb 不再各走各的，不会出现短暂不一致。

---

## 功能

- **实时合成** — 全部声音由 Web Audio API 合成，无音频文件依赖
- **三层混音** — 风声、水声、Drone 三层独立控制
- **卷积混响** — 手写山间 IR，并行干/湿总线架构
- **动态压缩** — 总线 limiter 防爆音，-6dB 阈值 / 8:1
- **五维调节** — 主音量 / 自然声 / 乐器 / 空间感 / 明亮度
- **概率事件** — 钟声、古琴随机触发，不循环、不重复
- **阶段规则** — 四个会话阶段自动调整参数（入定 → 安住 → 深境 → 回转）
- **粒子艺术** — 播放时温暖的数字粒子缓慢流动
- **偏好持久** — 模式、时长、滑杆值自动保存到本地
- **自定义时长** — 5 / 10 / 20 / 30 分钟或自定义

---

## 🚧 路线图

BreezeScape MVP（M0-M7）已完成。后续开发遵循 6 个 Sprint：

| Sprint | 主题 | 状态 |
|---|---|---|
| **1** | 让声音对得起耳机（粉红噪声 / 非谐钟 / Karplus 古琴 / 卷积混响） | 🟢 卷积混响 ✅ / 其余进行中 |
| **2** | Endel 化响应式输入（时辰 / 节气 / 天气 / 设备运动 / 麦克风） | 📋 规划中 |
| **3** | 禅式扩展（行禅 / 茶时 / 观息 / 木鱼 / 风铃 / 泉滴） | 📋 规划中 |
| **4** | 生成叙事（入山 → 见雾 → 听涧 → 安住 → 闻钟 → 归途） | 📋 规划中 |
| **5** | 个性化学习（听感校准 + 偏好 Bandit） | 📋 规划中 |
| **6** | UI 打磨（完成页 / 呼吸圆 / 移动端） | 📋 规划中 |

详细规划见 [docs/ROADMAP.md](docs/ROADMAP.md)。

---

## 🏗️ 设计纲领

BreezeScape 的底层公理是 **Endel 三公理 ⊕ 禅声三公理**：

**响应式（来自 Endel）**：
1. 声景 = 实时输入函数，不是预录素材
2. 每个声景对应明确的功能态（Flow / Circadian / 副交感）
3. "无重复"来自参数流的连续变化

**禅意（BreezeScape 的差异化）**：
1. 声音必须服务于"不注意声音"
2. 留白是材料，不是 bug
3. 声音是无常的隐喻：升起 → 安住 → 消散

> Endel 帮你完成任务，**竹间息帮你忘掉任务**。

详见 [docs/ROADMAP.md](docs/ROADMAP.md) 第 2 节。

---

## 技术栈

```
React 19 + TypeScript
Vite 8
Web Audio API
Canvas 2D (粒子)
localStorage
PWA (vite-plugin-pwa + Workbox)
无后端，无账号，无依赖
```

支持 PWA：可"添加到主屏幕"以独立 App 模式运行，离线可用。纯静态部署。

---

## 项目结构

```
zenscape/
  README.md              ← 你在这里
  APP_SPEC.md            ← MVP 历史档案
  SOUND_SPEC.md          ← 声音规格历史档案
  TASKS.md               ← M0-M7 任务清单（已完成）
  docs/
    ROADMAP.md           ← 战略：6 个 Sprint 总览
    SPRINT_1_SPEC.md     ← 战术：Sprint 1 施工图
    CODEX_PROMPTS.md     ← 执行：Codex 提示词集
    assets/
      signal-chain.png   ← Sprint 1 信号链架构图
      roadmap.png        ← 6 Sprint 路线图
  app/
    src/
      audio/
        AudioEngine.ts   ← 音频引擎（风/水/Drone 三层 + 卷积混响 + limiter + 并行总线）
        OneShotPlayer.ts ← 钟声/古琴合成（五声音阶，路由至事件总线）
        scheduler.ts     ← 概率触发调度器（密度门控 + 最小间隔）
        rules.ts         ← 会话阶段规则引擎
        soundParams.ts   ← 声音参数类型
        soundscapes.ts   ← 模式预设（含独立 reverbWet 配置）
      components/
        ParticleCanvas.tsx
        SessionView.tsx
        ModeSelector.tsx
        DurationSelector.tsx
        SoundControls.tsx
      storage/
        preferenceStore.ts
      App.tsx
      App.css
    public/
      favicon.svg
```

---

## 设计原则

- **留白。** 声音之间的沉默是设计的一部分，不是 bug。
- **不循环。** 规则引擎驱动参数流，同一段声景不会重复出现。
- **不突然。** 所有音量、滤波、空间变化必须渐变（ramp），不允许爆音。
- **不打扰。** 钟声不提示，古琴不旋律化，一切声音服务于"不注意声音"。
- **不功用。** 不要 streak，不要 minutes this week，不要 achievement。
- **本地优先。** 无账号、无后端、无上传，所有数据留在浏览器。
- **浏览器即道场。** 无需安装，点击即用，AudioContext 在用户手势后才激活。

---

## 运行

```bash
cd app
npm install
npm run dev
```

## 部署

```bash
cd app
npm run build
# dist/ 目录可部署到任意静态托管
```

已部署到 GitHub Pages：[shadowxx789.github.io/zenscape](https://shadowxx789.github.io/zenscape/)

---

## 里程碑（已完成）

| 阶段 | 内容 | 状态 |
|------|------|------|
| M0 | 项目搭建、静态 UI、倒计时 | ✅ |
| M1 | AudioEngine 风声合成 | ✅ |
| M2 | 多层混音 + 滑杆 + 自定义时长 | ✅ |
| M3 | 钟声/古琴概率触发 | ✅ |
| M4 | 会话阶段规则引擎 | ✅ |
| M5 | 本地偏好持久化 | ✅ |
| M6 | 禅意粒子艺术 | ✅ |
| M7 | 测试 + 部署 | ✅ |

后续 Sprint 进展见 [docs/ROADMAP.md](docs/ROADMAP.md)。

---

## 🤝 贡献

本项目目前由 [@shadowxx789](https://github.com/shadowxx789) 主导开发，借助 Codex 协作。

如果你想：
- **听听声音** → 直接打开 [在线 demo](https://shadowxx789.github.io/zenscape/)
- **提建议** → 开 Issue
- **改代码** → 看 [docs/ROADMAP.md](docs/ROADMAP.md) 找到你想做的 Sprint，再看对应 spec

---

## 开源协议

MIT License — 自由使用，自由修改，自由分发。

---

*声声不住，念念不停。*
*坐听风过竹，竹不知风来。*
