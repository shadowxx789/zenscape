# verify — C++6 定稿验收工具

把原来只在 `ab-demo/`（约 5–8GB，gitignore）里的声音验收工具收进仓库：
脚本 + C++6 参考渲染（6 分钟 seed 64，mp3），不带 5GB 试听素材。
换一台机器，一条命令就能跑出同一份电平报告。

## 依赖

- python3 + numpy + scipy
- ffmpeg（解码与响度测量）

## 一条命令跑参考报告

```bash
cd tools/verify
python3 run_reference.py
```

输出 C++6 定稿在「手机外放模拟」（高通 300Hz + 低通 9kHz，`render_r4.phone`）下的
全部指标和门槛判定，写 `reference_report.json`。这是回归锚点：引擎或门槛改动后，
参考报告必须仍然 ALL PASS 且数值不漂。

2026-11-18 基线（本机）：ALL PASS。quiet_s 147（= plan.ts 注释里 C++6 实测 147/295）、
floor_vs_full -17.7、pass_spread 0.1、max_rise_2s 5.9、clicks 0。
mp3(192k) 相对原始 wav：仅 LUFS/峰值各差 0.2dB，门槛相关指标全部一致。

## 对比网页引擎的渲染

```bash
python3 upload_server2.py   # 本地接收器，POST /upload?name=xxx.wav|json → engine_out/
# 在网页引擎里离线渲染一场（seed 固定），wav + events json POST 上来，然后：
python3 verify_engine.py engine_out/你的渲染.wav
```

`verify_engine.py` 打印 engine v2 与 reference C++6 两列指标 + 门槛判定。
引擎的随机数与 Python 参考版不同，比的是统计量与门槛，不是逐样本相等。
（网页端「渲染一场并上传」目前是手工流程：`sampleEngine.prepareSession(mode, dur, density, seed)` 固定种子，离线渲整场。）

## 文件

| 文件 | 作用 |
|---|---|
| `run_reference.py` | 一条命令的参考报告入口 |
| `verify_engine.py` | 引擎渲染 vs 参考的门槛验收（原 ab-demo 版，只改了两处路径） |
| `render_b.py` / `render_b3.py` / `render_r4.py` / `render_r6.py` / `render_r8.py` | 原样保留的 Python 参考版；`r4.phone` 是手机模拟滤波，`r8` 是 C++6 配方与试听史 |
| `ZenScape_R8_Cpp6_s64.mp3` | C++6 定稿参考渲染（360s，192k） |
| `reference_s64_events.json` | seed 64 的钟/琴时间线 |
| `upload_server2.py` | 本地接收器（engine_out/ 已 gitignore） |

## 与仓库其他测试的关系

- `app/src/audio/v2/plan.test.ts` 验乐谱层门槛（纯函数，npm test）。
- 这里验声音层：手机模拟响度、钟/琴高出底多少、深静实测、涌起与爆音。
- 两层都过，才算一场合格的会话。
