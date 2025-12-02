import {
  IAudioTelemetry,
  BufferHealthState,
  TelemetryCallback,
} from '../types';

/**
 * Production telemetry manager for audio stream performance monitoring.
 * Tracks key metrics for debugging, monitoring, and optimization.
 */
export class TelemetryManager {
  private _sessionId: string;
  private _chunksPlayed: number = 0;
  private _chunksDropped: number = 0;
  private _bufferUnderruns: number = 0;
  private _bufferOverruns: number = 0;
  private _latencyHistory: number[] = [];
  private _peakLatencyMs: number = 0;
  private _jitterHistory: number[] = [];
  private _playbackStartTime: number = 0;
  private _totalPlaybackDurationMs: number = 0;
  private _streamRestarts: number = 0;
  private _bufferHealthState: BufferHealthState = 'idle';
  private _lastUpdatedAt: number = 0;
  private _callback: TelemetryCallback | null = null;
  private _reportIntervalId: ReturnType<typeof setInterval> | null = null;

  private static readonly MAX_HISTORY_SIZE = 100;
  private static readonly DEFAULT_REPORT_INTERVAL_MS = 5000;

  constructor(sessionId?: string) {
    this._sessionId = sessionId || this._generateSessionId();
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Generates a unique session ID
   */
  private _generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Records a successful chunk playback
   */
  public recordChunkPlayed(latencyMs: number): void {
    this._chunksPlayed++;
    this._recordLatency(latencyMs);
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Records a dropped chunk
   */
  public recordChunkDropped(): void {
    this._chunksDropped++;
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Records a buffer underrun event
   */
  public recordUnderrun(): void {
    this._bufferUnderruns++;
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Records a buffer overrun event
   */
  public recordOverrun(): void {
    this._bufferOverruns++;
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Records latency measurement
   */
  private _recordLatency(latencyMs: number): void {
    this._latencyHistory.push(latencyMs);
    if (this._latencyHistory.length > TelemetryManager.MAX_HISTORY_SIZE) {
      this._latencyHistory.shift();
    }
    if (latencyMs > this._peakLatencyMs) {
      this._peakLatencyMs = latencyMs;
    }
  }

  /**
   * Records jitter measurement
   */
  public recordJitter(jitterMs: number): void {
    this._jitterHistory.push(jitterMs);
    if (this._jitterHistory.length > TelemetryManager.MAX_HISTORY_SIZE) {
      this._jitterHistory.shift();
    }
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Records playback start
   */
  public recordPlaybackStart(): void {
    this._playbackStartTime = Date.now();
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Records playback stop and calculates duration
   */
  public recordPlaybackStop(): void {
    if (this._playbackStartTime > 0) {
      this._totalPlaybackDurationMs += Date.now() - this._playbackStartTime;
      this._playbackStartTime = 0;
    }
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Records a stream restart
   */
  public recordStreamRestart(): void {
    this._streamRestarts++;
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Updates buffer health state
   */
  public updateBufferHealthState(state: BufferHealthState): void {
    this._bufferHealthState = state;
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Gets current telemetry snapshot
   */
  public getTelemetry(): IAudioTelemetry {
    const avgLatency = this._calculateAverage(this._latencyHistory);
    const avgJitter = this._calculateAverage(this._jitterHistory);

    // Include current playback duration if still playing
    let totalDuration = this._totalPlaybackDurationMs;
    if (this._playbackStartTime > 0) {
      totalDuration += Date.now() - this._playbackStartTime;
    }

    return {
      sessionId: this._sessionId,
      chunksPlayed: this._chunksPlayed,
      chunksDropped: this._chunksDropped,
      bufferUnderruns: this._bufferUnderruns,
      bufferOverruns: this._bufferOverruns,
      averageLatencyMs: Math.round(avgLatency * 100) / 100,
      peakLatencyMs: this._peakLatencyMs,
      averageJitterMs: Math.round(avgJitter * 100) / 100,
      totalPlaybackDurationMs: totalDuration,
      streamRestarts: this._streamRestarts,
      bufferHealthState: this._bufferHealthState,
      lastUpdatedAt: this._lastUpdatedAt,
    };
  }

  /**
   * Calculates average of a number array
   */
  private _calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Starts periodic telemetry reporting
   */
  public startReporting(
    callback: TelemetryCallback,
    intervalMs: number = TelemetryManager.DEFAULT_REPORT_INTERVAL_MS
  ): void {
    this._callback = callback;
    this.stopReporting(); // Clear any existing interval

    this._reportIntervalId = setInterval(() => {
      if (this._callback) {
        this._callback(this.getTelemetry());
      }
    }, intervalMs);
  }

  /**
   * Stops periodic telemetry reporting
   */
  public stopReporting(): void {
    if (this._reportIntervalId) {
      clearInterval(this._reportIntervalId);
      this._reportIntervalId = null;
    }
  }

  /**
   * Resets all telemetry data
   */
  public reset(): void {
    this._chunksPlayed = 0;
    this._chunksDropped = 0;
    this._bufferUnderruns = 0;
    this._bufferOverruns = 0;
    this._latencyHistory = [];
    this._peakLatencyMs = 0;
    this._jitterHistory = [];
    this._playbackStartTime = 0;
    this._totalPlaybackDurationMs = 0;
    this._streamRestarts = 0;
    this._bufferHealthState = 'idle';
    this._lastUpdatedAt = Date.now();
  }

  /**
   * Cleans up resources
   */
  public destroy(): void {
    this.stopReporting();
    this._callback = null;
  }

  /**
   * Gets a summary string for logging
   */
  public getSummary(): string {
    const t = this.getTelemetry();
    const dropRate = t.chunksPlayed > 0 
      ? ((t.chunksDropped / (t.chunksPlayed + t.chunksDropped)) * 100).toFixed(1)
      : '0';
    
    return `[Telemetry] Played: ${t.chunksPlayed}, Dropped: ${t.chunksDropped} (${dropRate}%), ` +
           `Underruns: ${t.bufferUnderruns}, Avg Latency: ${t.averageLatencyMs}ms, ` +
           `Peak: ${t.peakLatencyMs}ms, Jitter: ${t.averageJitterMs}ms, ` +
           `Health: ${t.bufferHealthState}`;
  }
}

