# ZenScape TASKS

状态标记：`[ ]` 未开始，`[~]` 进行中，`[x]` 完成，`[blocked]` 阻塞。

## M0 项目搭建与静态 UI
- [x] 创建 Vite + React + TypeScript 项目。
- [x] 建立约定目录结构。
- [x] 实现首页：产品名、模式选择、时长选择、开始按钮。
- [x] 实现会话页：倒计时、播放/暂停、返回首页。
- [x] 手机宽度下页面不崩。

验收：点击“开始”能进入会话页；页面可运行；先不接音频。

## M1 AudioEngine 最小可用版
- [x] 创建 `src/audio/AudioEngine.ts`。
- [x] 实现 `init()`、`playLoop(url)`、`stopAll()`、`setMasterVolume()`。
- [x] 用户点击后创建 AudioContext。
- [x] 播放一个风声音频 loop。
- [x] 实现 3 秒淡入、3 秒淡出。
- [x] 防止重复点击造成多个 loop 叠加。

验收：点击播放能听到风声；暂停平滑淡出；反复播放/暂停不会叠声。

## M2 分层混音与滑杆控制
- [x] 实现 `SoundLayer`。
- [x] 风、水、drone 三层同时播放。
- [x] 每层独立 GainNode。
- [x] UI 增加自然、乐器、空间、明亮度四个滑杆。
- [x] `natureLevel` 同时影响风声和水声。
- [x] `brightness` 控制低通滤波器频率。

验收：拖动滑杆声音平滑变化，无爆音。

## M3 一次性事件与调度器
- [ ] 实现 OneShotPlayer。
- [ ] 实现 `scheduler.ts`，每 5 秒 tick。
- [ ] 根据 `density`、`bellProbability`、`pluckProbability` 触发事件。
- [ ] 支持最小事件间隔。
- [ ] 随机音量、声像、采样选择。
- [ ] 暂停时调度停止，继续时恢复。

验收：钟声/古琴偶尔出现，不是固定循环；连续 10 分钟无明显机械感。

## M4 会话阶段与规则引擎
- [ ] 实现 `getPhase(progress)`。
- [ ] 实现 `getModeBaseParams(mode)`。
- [ ] 实现 `applyPhaseRules`。
- [ ] 实现 `applyTimeRules`。
- [ ] 实现 `mapStateToSoundParams(state, preference, hour)`。
- [ ] 每 3-5 秒重新计算 SoundParams 并推给 AudioEngine。

验收：入睡更暗、更少事件；deep 更安静；returning 有回归感；参数变化平滑。

## M5 本地偏好与体验闭环
- [ ] 实现 `preferenceStore.ts`。
- [ ] 保存默认模式、默认时长、四个滑杆。
- [ ] JSON 解析失败时回退默认值。
- [ ] 增加“恢复默认”。
- [ ] 增加完成页：本次时长、再次开始按钮。

验收：刷新后偏好不丢；完成后能再次开始。

## M6 视觉与体验打磨
- [ ] 增加呼吸圆或一炷香进度视觉。
- [ ] 深色禅意配色。
- [ ] 移动端样式适配。
- [ ] 错误提示：音频加载失败、浏览器不支持、未点击无法播放。
- [ ] 减少动画选项或弱动画实现。

验收：第一次打开无需教程也能开始；视觉不喧宾夺主。

## M7 测试与发布
- [ ] 播放/暂停 20 次，确认无叠声。
- [ ] 耳机测试开始、暂停、结束，无爆音。
- [ ] 连续播放 20-30 分钟，无卡顿或越来越响。
- [ ] Chrome 桌面测试。
- [ ] Safari iPhone 测试。
- [ ] Chrome Android 测试。
- [ ] 素材 404 检查。
- [ ] 部署到静态托管平台。

验收：可分享 Web/PWA 原型。

## Codex 调度分工
- Codex A：M0 UI / 页面骨架。
- Codex B：M1-M2 AudioEngine / SoundLayer。
- Codex C：M3-M4 scheduler / rules / soundscapes。
- Codex D：测试、审查、音频风险检查。

## 当前下一步
1. 初始化 Vite 项目。
2. 完成 M0 静态 UI。
3. 准备最小音频素材占位与素材清单。
