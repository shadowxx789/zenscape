# app

竹间息 BreezeScape 的前端（React 19 + TypeScript + Vite）。项目介绍见仓库根目录的 [README](../README.md)。

```bash
npm install
npm run dev      # http://localhost:5173/zenscape/
npm test         # vitest：乐谱门槛测试（src/audio/v2/plan.test.ts）
npm run lint
npm run build    # 产物在 dist/，部署方式见根 README「部署」
```

- 发声引擎：`src/audio/engine.ts`（默认 v2；URL 加 `?engine=v1` 回到合成版）
- 录音素材与署名：`public/audio/v2/`、`public/audio/v2/soundscape.json`
- 调试面板（🎚）仅开发自用：静音底层、单听事件、手动触发钟和琴
