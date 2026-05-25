/**
 * AudioDiagnostics.ts — BreezeScape Audio Diagnostics Module
 *
 * This module provides real-time RMS (Root Mean Square) and Peak level instrumentation (in dBFS)
 * on Web Audio API nodes without altering the original signal path.
 *
 * How to add a new probe:
 * 1. Inside `AudioEngine.ts` init code: `this._diagnostics.attachProbe('yourProbeName', audioNode)`
 * 2. Retrieve metrics in realtime via `audioEngine.diagnostics.getRms('yourProbeName')`
 *    or `audioEngine.diagnostics.getAllStats()`.
 */

export interface ProbeStats {
  rms: number   // dBFS, -Infinity represents silence
  peak: number  // dBFS
}

export class AudioDiagnostics {
  private ctx: AudioContext
  private probes: Map<string, AnalyserNode> = new Map()

  constructor(ctx: AudioContext) {
    this.ctx = ctx
  }

  /**
   * Attaches an AnalyserNode to the output of the specified AudioNode for observation.
   * Uses "fork connection": source -> [original downstream] + AnalyserNode.
   * If a probe with the same name already exists, it is disposed and replaced.
   */
  attachProbe(name: string, node: AudioNode | null): void {
    if (!node) {
      console.warn(`[AudioDiagnostics] Cannot attach probe "${name}" to null node.`);
      return;
    }

    // Dispose existing probe with the same name if it exists
    const existing = this.probes.get(name);
    if (existing) {
      try {
        existing.disconnect();
      } catch (err) {
        console.warn(`[AudioDiagnostics] Error disconnecting existing probe "${name}":`, err);
      }
      this.probes.delete(name);
    }

    try {
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;

      node.connect(analyser);
      this.probes.set(name, analyser);
    } catch (err) {
      console.warn(`[AudioDiagnostics] Failed to attach probe "${name}":`, err);
    }
  }

  /** Gets the current RMS (dBFS) for a specific probe. Returns -Infinity if probe doesn't exist. */
  getRms(name: string): number {
    const stats = this.getStatsForProbe(name);
    return stats ? stats.rms : -Infinity;
  }

  /** Gets the current peak (dBFS) for a specific probe. Returns -Infinity if probe doesn't exist. */
  getPeak(name: string): number {
    const stats = this.getStatsForProbe(name);
    return stats ? stats.peak : -Infinity;
  }

  /** Gets a snapshot of the current stats for all probes. */
  getAllStats(): Record<string, ProbeStats> {
    const stats: Record<string, ProbeStats> = {};
    for (const name of this.probes.keys()) {
      const probeStats = this.getStatsForProbe(name);
      if (probeStats) {
        stats[name] = probeStats;
      } else {
        stats[name] = { rms: -Infinity, peak: -Infinity };
      }
    }
    return stats;
  }

  /** Lists the names of all active probes. */
  getProbeNames(): string[] {
    return Array.from(this.probes.keys());
  }

  /** Disconnects all analyser nodes and clears the probes map. */
  dispose(): void {
    for (const [name, analyser] of this.probes.entries()) {
      try {
        analyser.disconnect();
      } catch (err) {
        console.warn(`[AudioDiagnostics] Error disconnecting probe "${name}" during dispose:`, err);
      }
    }
    this.probes.clear();
  }

  /** Calculates the stats (rms and peak in dBFS) for a given probe name. */
  private getStatsForProbe(name: string): ProbeStats | null {
    const analyser = this.probes.get(name);
    if (!analyser) return null;

    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);

    let sumSq = 0;
    let peakLin = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i];
      sumSq += v * v;
      const abs = Math.abs(v);
      if (abs > peakLin) {
        peakLin = abs;
      }
    }

    const rmsLin = Math.sqrt(sumSq / buf.length);
    const rmsDb = rmsLin > 0 ? 20 * Math.log10(rmsLin) : -Infinity;
    const peakDb = peakLin > 0 ? 20 * Math.log10(peakLin) : -Infinity;

    return { rms: rmsDb, peak: peakDb };
  }
}
