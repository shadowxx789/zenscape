// 构建后断言：dist/audio 下每个素材（mp3 + soundscape.json）都必须出现在 dist/sw.js 预缓存清单里。
// 漏一条 = 飞行模式开场缺一层声音。挂在 npm run build 之后，缺了就让构建红。
import { readdirSync, readFileSync } from 'node:fs'

const dist = new URL('../dist', import.meta.url).pathname
const sw = readFileSync(dist + '/sw.js', 'utf8')
const dir = dist + '/audio/v2'
const files = readdirSync(dir).filter(f => /\.(mp3|json)$/.test(f)).sort()
const missing = files.filter(f => !sw.includes('audio/v2/' + f))

if (files.length === 0) {
  console.error('[check-precache] no audio assets found under ' + dir)
  process.exit(1)
}
if (missing.length > 0) {
  console.error('[check-precache] missing from sw.js precache: ' + missing.join(', '))
  console.error('[check-precache] fix globPatterns in vite.config.ts (mp3/json must be included)')
  process.exit(1)
}
console.log('[check-precache] ok: ' + files.length + ' audio assets precached')
