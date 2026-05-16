export type SoundParams = {
  masterVolume: number
  natureLevel: number
  instrumentLevel: number
  spatialLevel: number
  brightness: number
}

export const DEFAULT_PARAMS: SoundParams = {
  masterVolume: 0.6,
  natureLevel: 0.7,
  instrumentLevel: 0.5,
  spatialLevel: 0.3,
  brightness: 0.5,
}
