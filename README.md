# 竹间息 BreezeScape

> 竹间息 BreezeScape——风过竹林，声声不住，念念不停。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Live Demo](https://img.shields.io/badge/demo-online-brightgreen)](https://shadowxx789.github.io/zenscape/)
[![Tech](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Tech](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tech](https://img.shields.io/badge/Web%20Audio%20API-native-FF6F00)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

## 偈

```
风从何处来，水向何处去。
不觅声来处，声声皆自渡。
钟落空山寂，琴收万壑虚。
即心是净土，何须问归途。
```

---

## 什么是竹间息

竹间息是一个生成式冥想声景应用。不是播放列表，不是白噪声合集：竹叶、微风、山涧、远寺的钟、偶尔一声古琴，都是真实录音；但什么时候响、从哪边来、多大声，每一次都由程序重新编排。同一段声景不会出现第二次。

你不需要做任何事。选一个模式、一段时长、几分声音，闭上眼睛。

声音会自己走。

**→ [在线体验](https://shadowxx789.github.io/zenscape/)**（手机外放即可，不必戴耳机）

---

## 开始前只选三件事

| 选择 | 选项 |
|---|---|
| 此刻，想要 | 静坐 · 入睡 · 专注 |
| 留多久 | 5 · 10 · 20 · 30 分钟，或自定 1–180 分钟 |
| 声音几分 | 疏 · 中 · 满 |

没有滑杆。声音的平衡是一轮轮试听调出来的，交给用户细调只会把它调坏；在手机外放上，多数细调也听不出区别。所以只留一个开关：开始前选疏密，播放中不改。

- **疏 · 大段留白**：风常歇、歇得更深，风歇里常有几秒深静；古琴很少，只单音。
- **中 · 风静各半**：琴声隔一会儿来一句。这一档是反复试听定稿的基准。
- **满 · 声音常在**：风只是轻一点、不停，水几乎不退；琴句更勤，常两三声成句。

> 入睡、专注两个模式目前沿用静坐的声音，只做了推断性调整（入睡琴更稀、钟更疏；专注水声稍亮），还没有经过试听定稿。

---

## 声音设计

### 程序只决定「何时、何处、多大」

每次进入声景，引擎用一个随机种子写出整段会话的「乐谱」（`app/src/audio/v2/plan.ts`，纯函数，同一种子可复现）：

- **底层呼吸**：竹叶和微风在吹过与安静之间慢慢呼吸；风歇时水也退下去，但不退成真空，只剩隐约的风和水。
- **深静**：少数几处 5–8 秒的深度寂静，避开钟和琴的尾音。
- **钟**：约三分钟一次，远、沉，像从山那边传来；会话最后一声总是钟，尾音散尽才停。
- **古琴**：一个小音池，大多单音；成句时有「记忆」——动机会被再现、倒影、截短或平移，但不连弹同一音，也不形成旋律。
- **风回来不涌**：风从静处回来有限速；每一阵风拉平到同一响度，长静之后的那一阵再轻一点。

乐谱写好后要过一组门槛：钟和琴必须听得见、深静足够、底层不突跳。不过就换一个派生种子重写，最多 16 次。

### 声音来自真实录音

竹叶、微风、山涧、东京增上寺的钟、一段古琴录音，全部来自 Freesound 的 CC0 / CC BY 素材，经过剪辑、滤波、混响与包络处理。来源与授权见 [CREDITS.md](CREDITS.md)，首页底部「声音来源」也能看到。

### 空间

一条大空间卷积混响托住竹林（真立体声）。钟和古琴另走「远处」：先过一道空气低通，再加长预延迟和长尾，像隔着雾传过来，而不是贴在耳边。

### 以手机外放为准

主要的收听场景是夜里、手机外放。所有听感验收都在手机外放模拟（高通 300 Hz + 低通 9 kHz）下做，而不是在耳机上。

---

## 界面

墨、雾、留白；景退，声前。

- 首页：竹林在左，墨色从右侧慢慢洇开；竹影极轻地摇。
- 计时页：一只细圆环、一个数字。圆环约 10 秒呼吸一次，可以跟着它呼吸；按下播放，背景退到一半。
- 九秒不碰屏幕，文字全部隐去，只留一环一数；碰一下再浮现。
- 结束前约 20 秒，画面随最后一声钟一起暗下去；离开时声音和画面一起淡出。
- 钟响时圆环外散开一圈极淡的金线，古琴在圆环上亮起一小段弧；两侧各有一颗很慢的光斑。
- 支持系统的「减少动态效果」：开启后不摇、不呼吸、不过渡。

---

## 功能

- **真实录音 + 生成式乐谱**：按种子编排，不重复
- **三模式 × 三档疏密 × 任意时长**（1–180 分钟）
- **会话四段**：渐入 → 安住 → 深境 → 回转，计时页右上角有四格进度
- **离线可用**：PWA，可添加到主屏幕，素材全部预缓存
- **本地偏好**：模式、时长、疏密保存在浏览器里
- **无账号、无后端、无追踪**

---

## 🏗️ 设计纲领

**禅声三公理**：

1. 声音必须服务于「不注意声音」。越被注意越是失败
2. 留白是材料，不是 bug
3. 声音是无常的隐喻：升起 → 安住 → 消散

> Endel 帮你完成任务，**竹间息帮你忘掉任务**。

不做 streak，不做 minutes this week，不做 achievement。

---

## 进展

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0–M7 | MVP：合成引擎、五层声音、调度器、阶段规则、偏好、粒子、部署 | ✅ 2026-05 |
| Sprint 1 | 让合成声音更真：粉红噪声、非谐钟、Karplus 古琴、卷积混响 | ✅ 完成后被 v2 取代 |
| v2 引擎 | 换成真实录音 + 种子乐谱；在手机外放下逐轮试听定稿 | ✅ 2026-10 |
| 疏 · 中 · 满 | 五个滑杆退场，换成开始前选的三档疏密 | ✅ 2026-10 |
| 界面重做 | 墨、雾、留白；呼吸圆环、无操作隐去、慢淡入淡出 | ✅ 2026-10 |
| 入睡 / 专注 | 两个模式的声音出试听、定稿 | 📋 下一步 |
| 真机验证 | iPhone 锁屏后是否继续发声 | 📋 待验 |
| Sprint 2–5 | 响应式输入、禅式扩展、生成叙事、个性化 | 💤 搁置 |

在线地址后加 `?engine=v1` 可以回到 MVP 时期的合成引擎，作对比用。

---

## 📐 文档

| 文档 | 内容 |
|---|---|
| 🎧 [CREDITS.md](CREDITS.md) | 声音素材来源与授权 |
| 🗺️ [docs/ROADMAP.md](docs/ROADMAP.md) | 2026-05 的六个 Sprint 规划（顶部有现状说明） |
| 🔧 [docs/SPRINT_1_SPEC.md](docs/SPRINT_1_SPEC.md) | Sprint 1 施工图：合成声音升级（历史档案） |
| 🤖 [docs/CODEX_PROMPTS.md](docs/CODEX_PROMPTS.md) | Sprint 1 的 Codex 提示词（历史档案） |
| 📏 [docs/AUDIO_BASELINE.md](docs/AUDIO_BASELINE.md) · [docs/PHASE1_EXPERIMENT.md](docs/PHASE1_EXPERIMENT.md) | v1 合成引擎的电平测量（历史档案） |
| 📜 [APP_SPEC.md](APP_SPEC.md) · 🔊 [SOUND_SPEC.md](SOUND_SPEC.md) · ✅ [TASKS.md](TASKS.md) | MVP 规格与 M0–M7 任务（历史档案） |

---

## 技术栈

```
React 19 + TypeScript 6
Vite 8
Web Audio API（AudioBufferSource · ConvolverNode · OfflineAudioContext）
Canvas 2D（光斑与涟漪）
vitest（乐谱门槛测试）
PWA（vite-plugin-pwa + Workbox）
localStorage
无后端、无账号；运行时只依赖 React
```

---

## 项目结构

```
zenscape/
  README.md               ← 你在这里
  CREDITS.md              ← 声音素材来源与授权
  APP_SPEC.md · SOUND_SPEC.md · TASKS.md   ← MVP 历史档案
  docs/                   ← 路线图、Sprint 1、v1 电平测量（历史档案）
  app/
    public/audio/v2/      ← 导出的录音素材 + soundscape.json（含署名）
    src/
      audio/
        engine.ts         ← 选择发声引擎（默认 v2，?engine=v1 回到合成版）
        v2/
          plan.ts         ← 会话乐谱：风歇、深静、钟、古琴的时刻与电平
          plan.test.ts    ← 乐谱门槛测试（三档 × 多种时长 × 多种子）
          preset.ts       ← 模式预设 + 疏 / 中 / 满
          composer.ts     ← 古琴作曲：有记忆的随机
          space.ts        ← 大空间 / 远处空间的脉冲响应
          SampleEngine.ts ← 播放与离线渲染
          rng.ts          ← 可复现的随机数
        AudioEngine.ts …  ← v1 合成引擎（保留作对比）
      components/
        SessionView.tsx   ← 计时页：圆环、阶段、无操作隐去、结束淡出
        ParticleCanvas.tsx← 光斑与涟漪
        ModeSelector · DurationSelector · DensitySelector
        SoundCredits.tsx  ← 首页「声音来源」
      storage/preferenceStore.ts
      App.tsx · App.css · index.css
```

---

## 设计原则

- **留白。** 声音之间的沉默是设计的一部分，不是 bug。
- **不循环。** 每次会话重新编排，同一段声景不会重复出现。
- **不突然。** 所有音量、滤波、空间变化必须渐变；风回来也要限速。
- **不打扰。** 钟声不提示，古琴不旋律化，一切声音服务于「不注意声音」。
- **不功用。** 不要 streak，不要 minutes this week，不要 achievement。
- **本地优先。** 无账号、无后端、无上传，所有数据留在浏览器。
- **浏览器即道场。** 无需安装，点击即用，AudioContext 在用户手势后才激活。

---

## 运行

```bash
cd app
npm install
npm run dev        # 本地开发
npm test           # 乐谱门槛测试
npm run build      # 产物在 app/dist/
```

## 部署

合进 `main` 不会自动上线。站点由 `gh-pages` 分支提供：构建后用 `app/dist/` 的内容替换 `gh-pages` 根目录的构建产物（保留 `sprint-1.5/` 与 `.nojekyll`），推送即可。

已部署：[shadowxx789.github.io/zenscape](https://shadowxx789.github.io/zenscape/)。手机若打开过旧版，PWA 缓存可能要关掉页面重开一两次才会更新。

---

## 🤝 贡献

本项目由 [@shadowxx789](https://github.com/shadowxx789) 主导开发，借助 AI 协作。

- **听听声音** → 打开 [在线 demo](https://shadowxx789.github.io/zenscape/)
- **提建议** → 开 Issue

---

## 开源协议

代码：MIT License。声音素材各自遵循其授权（CC0 / CC BY 4.0），见 [CREDITS.md](CREDITS.md)。

---

*声声不住，念念不停。*
*坐听风过竹，竹不知风来。*
