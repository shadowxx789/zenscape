export type SoundParams = {
  masterVolume: number
  natureLevel: number
  instrumentLevel: number
  spatialLevel: number
  brightness: number
}

export const DEFAULT_PARAMS: SoundParams = {
  masterVolume: 0.48,
  natureLevel: 0.62,
  instrumentLevel: 0.34,
  spatialLevel: 0.44,
  brightness: 0.44,
}
