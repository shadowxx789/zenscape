# AGENTS.md

给在本仓库工作的 AI 编码助手看的说明。人类读者请先看 [README.md](README.md)。

## 项目是什么

竹间息 BreezeScape：生成式冥想声景 PWA。真实录音（竹、风、水、钟、古琴）+ 按随机种子写出的整场「乐谱」，纯前端，无后端、无账号、无追踪。

- 线上：https://shadowxx789.github.io/zenscape/
- 技术栈：React 19 + TypeScript 6 + Vite 8 + Web Audio API + vite-plugin-pwa；测试用 vitest。运行时依赖只有 React。
- 所有代码在 `app/`，命令都在 `app/` 下执行。

## 命令

```bash
cd app
npm install
npm run dev      # 本地开发，地址带 /zenscape/ 前缀
npm test         # 乐谱门槛测试（vitest，约 15 秒）
npm run lint     # eslint
npm run build    # tsc -b && vite build，产物在 app/dist/
```

交付前三项都要过：`rm -rf dist && npm run build && npm test && npm run lint`。

## 目录

```
app/
  public/audio/v2/        录音素材 mp3 + soundscape.json（含署名，改素材必须同步改这里和 CREDITS.md）
  src/audio/engine.ts     选择发声引擎：默认 v2；?engine=v1 回到旧合成引擎（只作对比）
  src/audio/v2/
    plan.ts               会话乐谱：纯函数，同一种子可复现；planIssues() 是门槛
    plan.test.ts          门槛测试：三档疏密 × 多种时长 × 多种子
    preset.ts             模式预设 + 疏 / 中 / 满（Density: sparse | mid | full）
    composer.ts           古琴：有记忆的随机，不成旋律
    space.ts              大空间 / 远处空间脉冲响应
    SampleEngine.ts       播放、离线 / 流式预渲染
    bgTest.ts             ?bgtest=1 后台播放诊断
  src/audio/AudioEngine.ts 等   v1 合成引擎，保留作对比，不再开发
  src/components/SessionView.tsx 计时页：圆环、阶段、无操作隐去（IDLE_MS）、结束淡出（ENDING_S）
  src/components/ParticleCanvas.tsx 光斑与涟漪
  src/assets/             背景图（桌面 / 手机各一套，jpg + avif）
  dev/                    手工测试页（频谱、接缝、运行时）
docs/                     路线图与规格；除 JOURNEY_SPEC.md 外都是历史档案
APP_SPEC.md SOUND_SPEC.md TASKS.md   MVP 历史档案，不代表现状
ab-demo/                  本地试听渲染（约 5 GB），gitignore，不要提交、不要删
```

现状以 README 的「进展」一节为准。下一阶段是「一程」（六段旅程取代三模式），构思在 `docs/JOURNEY_SPEC.md`，引擎尚未开工。

## 调试用 URL 参数

- `?engine=v1` 旧合成引擎
- `?render=stream`（默认）/ `?render=live` 渲染方式
- `?bgtest=1` 手机后台 / 锁屏播放隔离测试
- `?diag=1` 诊断面板

## 设计约束（改代码前先读）

1. **声音服务于「不注意声音」。** 新声音一律远、稀、低于底；不能有一个声音跳出来要人注意。不用人声、脚步、诵经等类人声音。
2. **留白是材料。** 深静、风歇是设计，不是 bug，别「修」掉。
3. **不突然。** 音量、滤波、空间变化都必须 ramp；风回来要限速。AudioContext 只在用户手势后创建。
4. **不功用。** 不做 streak、时长统计、成就、提示音。
5. **听感验收以手机外放为准**（高通 300 Hz + 低通 9 kHz 模拟），不以耳机为准。
6. **不加滑杆。** 用户只在开始前选模式、时长、疏密，播放中不改。
7. **本地优先。** 不加后端、上传、分析脚本。

## 协作规则

- **审美与听感由 Eric 拍板。** 涉及口味的改动（素材选择、电平、裁切、雾、动效强度、配色），给 2–3 个带标签、只改一个维度的版本让他选；不要替他定默认值。已经试听定稿的素材和参数（「定稿 C++6」）不要按文件名、波形或元数据自行重选。
- **规格逐字执行。** 任务书里给出的代码或文档段落原样使用，不顺手优化。
- **测试失败就停。** 贴完整报错等指令；不改代码绕过，不放宽 `plan.test.ts` 的门槛断言。
- **视觉 / 交互 bug 先在 390×844 手机尺寸复现再修。** 多数问题是桌面调好的 px 值在手机上失效。尺寸从 `Math.min(innerWidth, innerHeight)` 推，不写死 px。
- **用测量代替目测。** 这个界面接近全黑，截图交给视觉模型判断不可靠。背景变化量亮度，图层归属用 visibility 切换后做像素 diff。
- **已认可的界面不要顺带改。** 例如首页未选中项的文字对比度已确认，不要混进别的改动里。
- 临时复现改动（如缩短 `totalSeconds` / `ENDING_S`）标 `TEMP-REPRO`，构建前还原。

## Git 与部署

- 只有一个工作目录，不要再建第二个 worktree 长期使用。远端分支只有 `main` 和 `gh-pages`。
- 提交信息沿用现有前缀：`feat(audio)`、`fix(ui)`、`fix(motion)`、`docs(journey)`、`test(audio)`、`refine`、`chore` 等。
- **推送 `main` 和部署都要先得到 Eric 同意。**
- **合进 `main` 不会自动上线**，没有 CI。站点由 `gh-pages` 分支提供，部署方法：
  1. 在 `main` 上 `rm -rf dist && npm run build && npm test && npm run lint`，推送 `main`。
  2. 在临时 detached worktree 检出 `origin/gh-pages`。
  3. **只替换构建产物**：`git rm -r assets`，再 `cp -R app/dist/. <worktree>`。不要清空整个分支，`gh-pages` 上还有 `app/`、`audio/`、`docs/`、`icons/`、`.nojekyll`。正常 diff 约 10 个文件（assets 增删、index.html、sw.js、manifest）。
  4. 提交 `deploy: <摘要> (main <sha>)`，推 `HEAD:gh-pages`。
  5. 等 Pages 构建完成，确认线上 `index.html` 引用的资源哈希与 `dist/assets` 一致。
- 手机上的 PWA 可能要关掉重开一两次才更新。

## 已知坑

- `vite preview` 也会注册 Service Worker：重新构建后页面仍可能跑旧包。测量前先注销 SW、清缓存。
- PWA 预缓存 `globPatterns` 目前不含 `mp3`，`dist/audio` 下的录音没有预缓存，离线开场会无声。声称「离线可用」前先查 `dist/sw.js`。
- 用 `sips` 生成的 AVIF 没有色彩标记，Chrome 下亮度约减半。用 ffmpeg libsvtav1 10-bit 并写明 bt709 / iec61966-2-1 色彩参数，再和 JPG 对比实际亮度。
- 手机后台 / 锁屏的音频问题只在桌面验证过不算修好，要在真机上验。
- 状态降级只靠透明度会回弹：`is-ending` 换成 `is-finished` 时过渡会把图层拉回 1。结束态要有自己的透明度规则。
- 深色背景上极低透明度的径向渐变会出色带，在 OLED 上像脏雾；峰值 alpha 保持在约 0.05 以下。
