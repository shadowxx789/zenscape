# ZenScape APP_SPEC

项目：禅音 ZenScape
版本：v0.1 MVP
日期：2026-05-05

## 一句话定位
东方禅意的生成式冥想声景 Web/PWA：用户选择静坐、入睡、专注等场景后，App 根据会话进度与偏好实时混合风、水、低频 drone、钟、古琴等声音层，生成不会明显循环、慢慢变化的禅意声景。

## 本轮开发原则
- 严格按原 PRD 的 MVP 方案推进，不再额外砍范围。
- 每个里程碑都必须可运行、可听、可测试。
- UI、状态、规则、音频引擎分离；UI 不直接操作 AudioNode。
- 浏览器音频初始化必须发生在用户点击之后。
- 所有音量、滤波、空间参数变化必须 ramp，避免爆音。
- 不做账号、不做后端、不做医疗承诺。

## MVP P0 范围
- 三个模式：静坐、入睡、专注。
- 会话时长：5、10、20、30 分钟。
- 基础音频引擎：播放/暂停、淡入淡出、循环自然声、一次性钟声/古琴音。
- 五个声音层：风、水、低频 drone、钟、古琴。
- 生成式规则：根据会话进度改变声音密度、明亮度和事件概率。
- 设置：自然声强度、乐器强度、空间感、明亮度。
- 本地保存用户设置。

## 非目标
- 账号、订阅、后端、社交、社区、排行榜。
- AI 生成整段音乐。
- 医疗/治疗类承诺。
- 移动端原生 App，上架流程。

## 技术栈
- React + TypeScript
- Vite
- Web Audio API
- localStorage
- 第一版以 Web/PWA 为目标

## 目录约定
```text
src/
  audio/
    AudioEngine.ts
    SoundLayer.ts
    scheduler.ts
    rules.ts
    soundscapes.ts
    types.ts
  components/
    ModeSelector.tsx
    DurationSelector.tsx
    SessionTimer.tsx
    SoundControls.tsx
    PlayButton.tsx
    BreathVisual.tsx
  store/
    sessionStore.ts
    preferenceStore.ts
  utils/
    math.ts
    storage.ts
  App.tsx
  main.tsx
public/
  audio/
    wind/
    water/
    bell/
    guqin/
```

## MVP 验收标准
1. 用户能在 10 秒内开始一次声景会话。
2. 声音有至少 3 个持续层和 2 个随机事件层。
3. 声音会随着会话阶段发生可感知但不突兀的变化。
4. 用户能调整自然、乐器、空间、明亮度。
5. 用户偏好能本地保存。
6. 连续播放 20 分钟没有明显 bug。
7. 没有医疗疗效承诺，没有版权不明素材。

## 主观听感标准
- 安静但不是死循环。
- 东方但不油腻。
- 有仪式感但不宗教化过重。
- 声音少但不空。
- 久听不累。
