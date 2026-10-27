# 声音素材来源 / Sound credits

竹间息 v2 引擎的所有声音都来自以下真实录音（Freesound）。
素材经过剪辑、滤波、拼接、混响与音量包络处理，处理流程见 `ab-demo/export_assets.py`。

| 用途 | 录音 | 作者 | 授权 |
|---|---|---|---|
| 竹林风 | [Wind In Bamboo 2.wav](https://freesound.org/people/Benboncan/sounds/72559/) | Benboncan | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| 微风 | [forest_ambience_steady_breeze_summer_sweden…](https://freesound.org/people/johanwestling/sounds/460178/) | johanwestling | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 山涧 | [Stream, Running Water \| Aviemore Scotland](https://freesound.org/people/BurghRecords/sounds/415151/) | BurghRecords | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| 钟 | [BELLLrg_Temple_Japan_Tokyo_Zojo_Ji_Bell_Tower_VerdiMic_260101](https://freesound.org/people/Echograin/sounds/843521/) | Echograin | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| 古琴 | [Guqin-1.wav](https://freesound.org/people/xserra/sounds/161908/) | xserra | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

导出后的文件在 `app/public/audio/v2/`，同一份清单也写在 `app/public/audio/v2/soundscape.json` 的 `credits` 字段里，应用首页底部的「声音来源」会读取它。
