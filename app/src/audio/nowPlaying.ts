/**
 * 系统「正在播放」：状态栏 / 锁屏的媒体卡片。
 *
 * 安卓 Chrome 只给 <audio>/<video> 建媒体会话，纯 Web Audio 不会出现在状态栏。
 * 所以播放时同时循环一段几乎无声（-80dB 噪声，全零可能被当成静音）的 <audio>，
 * 再挂上 Media Session 的标题和播放 / 暂停按钮。真机（OPPO，安卓 Chrome）验证：后台不断，状态栏显示播放。
 */

let el: HTMLAudioElement | null = null
let url: string | null = null

function quietWavUrl(): string {
  const sr = 8000
  const n = sr * 10
  const pcm = new Int16Array(n * 2)
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round((Math.random() * 2 - 1) * 3) // ≈ -80dBFS
  const h = new DataView(new ArrayBuffer(44))
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) h.setUint8(o + i, s.charCodeAt(i))
  }
  w(0, 'RIFF')
  h.setUint32(4, 36 + pcm.byteLength, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  h.setUint32(16, 16, true)
  h.setUint16(20, 1, true)
  h.setUint16(22, 2, true)
  h.setUint32(24, sr, true)
  h.setUint32(28, sr * 4, true)
  h.setUint16(32, 4, true)
  h.setUint16(34, 16, true)
  w(36, 'data')
  h.setUint32(40, pcm.byteLength, true)
  return URL.createObjectURL(new Blob([h, pcm], { type: 'audio/wav' }))
}

export type NowPlayingHandlers = { onPlay: () => void; onPause: () => void }

/** 在用户点播放的那一下调用（要用户手势才能 play） */
export async function startNowPlaying(title: string, handlers: NowPlayingHandlers): Promise<void> {
  if (!el) {
    url = quietWavUrl()
    el = new Audio(url)
    el.loop = true
  }
  try {
    await el.play()
  } catch {
    /* 只影响状态栏，不影响发声 */
  }
  if (!('mediaSession' in navigator)) return
  const icon = `${import.meta.env.BASE_URL}icons/icon-512x512.png`
  navigator.mediaSession.metadata = new MediaMetadata({
    title,
    artist: '竹间息',
    artwork: [{ src: icon, sizes: '512x512', type: 'image/png' }],
  })
  navigator.mediaSession.playbackState = 'playing'
  navigator.mediaSession.setActionHandler('play', handlers.onPlay)
  navigator.mediaSession.setActionHandler('pause', handlers.onPause)
}

/** 暂停：卡片保留，按钮变成播放 */
export function pauseNowPlaying(): void {
  el?.pause()
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
}

/** 会话结束 / 离开：卡片撤掉 */
export function stopNowPlaying(): void {
  if (el) {
    el.pause()
    el.removeAttribute('src')
    el.load()
    el = null
  }
  if (url) {
    URL.revokeObjectURL(url)
    url = null
  }
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = null
    navigator.mediaSession.playbackState = 'none'
    navigator.mediaSession.setActionHandler('play', null)
    navigator.mediaSession.setActionHandler('pause', null)
  }
}
