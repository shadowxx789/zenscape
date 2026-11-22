/**
 * MaterialPool：素材按段驻留的池语义（node 环境即可跑，用假解码器）。
 * 关键约束：同名发去重、驻留命中不重复解码、release 后可重取、releaseAll 清空。
 */
import { describe, expect, it, vi } from 'vitest'
import { MaterialPool } from './material'

type Buf = { id: string }
const buf = (id: string): Buf => ({ id })

function makePool() {
  const decodeFile = vi.fn(async (f: string): Promise<Buf> => {
    await new Promise((r) => setTimeout(r, 1)) // 模拟真解码：异步窗口内可能并发 ensure
    return buf(f)
  })
  return { pool: new MaterialPool<Buf>(decodeFile), decodeFile }
}

describe('MaterialPool 驻留语义', () => {
  it('ensure 各解一次；重复 ensure 命中缓存', async () => {
    const { pool, decodeFile } = makePool()
    const a = await pool.ensure(['a', 'b'])
    expect(a.get('a')!.id).toBe('a')
    expect(decodeFile).toHaveBeenCalledTimes(2)
    await pool.ensure(['a', 'b'])
    expect(decodeFile).toHaveBeenCalledTimes(2)
    expect(pool.size).toBe(2)
  })

  it('同名并发去重：窗口内多次 ensure 只解码一次', async () => {
    const { pool, decodeFile } = makePool()
    await Promise.all([pool.ensure(['x']), pool.ensure(['x']), pool.ensure(['x'])])
    expect(decodeFile).toHaveBeenCalledTimes(1)
  })

  it('release 指定素材：下次 ensure 重解码，未释放的不动', async () => {
    const { pool, decodeFile } = makePool()
    await pool.ensure(['a', 'b'])
    pool.release(['a'])
    expect(pool.has('a')).toBe(false)
    expect(pool.has('b')).toBe(true)
    await pool.ensure(['a', 'b'])
    expect(decodeFile).toHaveBeenCalledTimes(3) // 只补回 a
  })

  it('releaseAll：全部释放（离开会话视图），再进会话全部重解码', async () => {
    const { pool, decodeFile } = makePool()
    await pool.ensure(['a', 'b', 'c'])
    pool.releaseAll()
    expect(pool.size).toBe(0)
    await pool.ensure(['a', 'b', 'c'])
    expect(decodeFile).toHaveBeenCalledTimes(6)
  })

  it('解码失败不驻留也不卡死：下次 ensure 重试', async () => {
    const decodeFile = vi.fn(async (f: string): Promise<Buf> => {
      if (f === 'bad') throw new Error('decode failed')
      return buf(f)
    })
    const pool = new MaterialPool<Buf>(decodeFile)
    await expect(pool.ensure(['bad'])).rejects.toThrow('decode failed')
    expect(pool.size).toBe(0)
    decodeFile.mockImplementation(async (f: string) => buf(f))
    await expect(pool.ensure(['bad'])).resolves.toBeTruthy()
    expect(pool.has('bad')).toBe(true)
  })
})
