import { useEffect, useState } from 'react'

type Credit = { role: string; title: string; author: string; license: string; url: string }

const LICENSE_LABEL: Record<string, { label: string; url: string }> = {
  'by 4.0': { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'zero 1.0': { label: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
}

/** 首页底部的「声音来源」：CC BY 素材要求署名，清单来自 public/audio/v2/soundscape.json */
export function SoundCredits() {
  const [credits, setCredits] = useState<Credit[]>([])

  useEffect(() => {
    let alive = true
    fetch(`${import.meta.env.BASE_URL}audio/v2/soundscape.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { credits?: Credit[] } | null) => {
        if (alive && m?.credits) setCredits(m.credits)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  if (credits.length === 0) return null

  return (
    <details className="sound-credits">
      <summary>声音来源</summary>
      <p>以下真实录音经剪辑、滤波、拼接与混响处理后使用：</p>
      <ul>
        {credits.map((c) => {
          const lic = LICENSE_LABEL[c.license] ?? { label: c.license, url: '' }
          return (
            <li key={c.url}>
              {c.role.split(' ')[0]}：
              <a href={c.url} target="_blank" rel="noreferrer noopener">
                {c.title}
              </a>
              {' — '}
              {c.author}，
              {lic.url ? (
                <a href={lic.url} target="_blank" rel="noreferrer noopener">
                  {lic.label}
                </a>
              ) : (
                lic.label
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}
