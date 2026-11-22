/**
 * MaterialPool — 素材驻留管理。
 *
 * 为什么要它：解码后的 PCM 住在 JS 堆外（V8 堆看不见，进程 RSS 才看得见），
 * 一场会话的全部素材 ≈ 90MB。「一程」再加 6MB 新素材若全量常驻会到 +126MB，
 * 手机后台必被杀。所以素材按段驻留：段前预取、段尾释放（见 JOURNEY_SPEC §5.1）。
 *
 * 现在的五类素材全程在用，属于「常驻段」：prepareSession 一次 ensure 全部；
 * 离开会话视图时 releaseAll，90MB 当场还给系统。
 * 池只管「谁在驻留」，不管「该驻留谁」——分段策略由调用方（一程的 stage 表）决定。
 *
 * 泛型 T 让它可以在 vitest（node 环境，没有 AudioBuffer）里用假对象测。
 */

export class MaterialPool<T> {
  private cache = new Map<string, T>()
  private inflight = new Map<string, Promise<T>>()
  private decodeFile: (file: string) => Promise<T>

  constructor(decodeFile: (file: string) => Promise<T>) {
    this.decodeFile = decodeFile
  }

  /** 确保这些素材已解码驻留。同名并发去重；已驻留的直接命中缓存。 */
  async ensure(files: readonly string[]): Promise<Map<string, T>> {
    await Promise.all(
      files.map(async (f) => {
        if (this.cache.has(f)) return
        let p = this.inflight.get(f)
        if (!p) {
          p = this.decodeFile(f)
            .then((buf) => {
              this.cache.set(f, buf)
              return buf
            })
            .finally(() => {
              this.inflight.delete(f)
            })
          this.inflight.set(f, p)
        }
        await p
      }),
    )
    return new Map(files.map((f) => [f, this.cache.get(f) as T]))
  }

  /** 释放指定素材（过完交叉淡化、后面不再用的段）。正在渲染中的调用方自己保证时机。 */
  release(files: readonly string[]): void {
    for (const f of files) {
      this.cache.delete(f)
    }
  }

  /** 全部释放（离开会话视图）。之后 ensure 会重新解码。 */
  releaseAll(): void {
    this.cache.clear()
  }

  /** 当前驻留条数 / 是否驻留 */
  get size(): number {
    return this.cache.size
  }

  has(file: string): boolean {
    return this.cache.has(file)
  }
}
