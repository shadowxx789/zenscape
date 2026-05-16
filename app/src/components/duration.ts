export const DURATIONS = [5, 10, 20, 30] as const
export type DurationMinutes = (typeof DURATIONS)[number]
