import { Encoding, EncodingTypes } from "../types";
import { FrameProcessor } from "./FrameProcessor";
import { QualityMonitor } from "./QualityMonitor";
import { RingBuffer } from "./RingBuffer";
import ExpoPlayAudioStreamModule from "../ExpoPlayAudioStreamModule";
import {
  IAudioBufferConfig,
  IAudioBufferManager,
  IAudioFrame,
  IAudioPlayPayload,
  IBufferHealthMetrics,
} from "../types";

export class AudioBufferManager implements IAudioBufferManager {
  private static readonly _bufferCheckIntervalMs = 50;
  private static readonly _defaultRingBufferCapacity = 150; // ~3 seconds at 20ms/frame

  private _buffer: RingBuffer;
  private _config: IAudioBufferConfig;
  private _frameProcessor: FrameProcessor | null;
  private _qualityMonitor: QualityMonitor | null;
  private _playbackTimer: any = null;
  private _isActive: boolean = false;
  private _lastPlaybackTime: number = 0;
  private _nextSequenceNumber: number = 0;
  private _currentTurnId: string | null = null;
  private _encoding: Encoding = EncodingTypes.PCM_S16LE;

  constructor(config?: Partial<IAudioBufferConfig>) {
    this._config = {
      targetBufferMs: 240,
      minBufferMs: 120,
      maxBufferMs: 480,
      frameIntervalMs: 20,
      sampleRate: 16000,
      ...config,
    };

    // Calculate ring buffer capacity based on max buffer size and frame interval
    // Add 50% headroom for safety
    const estimatedMaxFrames = Math.ceil(
      (this._config.maxBufferMs / this._config.frameIntervalMs) * 1.5
    );
    this._buffer = new RingBuffer(
      Math.max(
        estimatedMaxFrames,
        AudioBufferManager._defaultRingBufferCapacity
      )
    );

    this._frameProcessor = new FrameProcessor(
      this._config.frameIntervalMs,
      this._config.sampleRate ?? 16000,
      this._getBytesPerSample()
    );
    this._qualityMonitor = new QualityMonitor(this._config.frameIntervalMs);
  }

  /** Set the turn ID for queue management integration */
  public setTurnId(turnId: string): void {
    this._currentTurnId = turnId;
  }

  /** Set the audio encoding format */
  public setEncoding(encoding: Encoding): void {
    this._encoding = encoding;
    if (this._frameProcessor) {
      this._frameProcessor.setBytesPerSample(this._getBytesPerSample());
    }
  }

  public enqueueFrames(audioData: IAudioPlayPayload): void {
    if (!this._frameProcessor || !this._qualityMonitor) {
      return;
    }

    const frames = this._frameProcessor.parseChunk(audioData);

    for (const frame of frames) {
      // RingBuffer.push handles overrun internally by overwriting oldest
      this._buffer.push(frame);
      this._qualityMonitor.recordFrameArrival(frame.timestamp);
    }

    const currentBufferMs = this.getCurrentBufferMs();
    this._qualityMonitor.updateBufferLevel(currentBufferMs);

    if (currentBufferMs > this._config.maxBufferMs) {
      this._handleOverrun();
    }
  }

  public startPlayback(): void {
    if (this._isActive) {
      return;
    }

    this._isActive = true;
    this._lastPlaybackTime = Date.now();

    const initialWaitMs = Math.min(this._config.targetBufferMs, 200);
    this._waitForBufferFill(initialWaitMs).then(() => {
      if (this._isActive) {
        this._startPlaybackLoop();
      }
    });
  }

  public stopPlayback(): void {
    this._isActive = false;

    if (this._playbackTimer) {
      clearTimeout(this._playbackTimer);
      this._playbackTimer = null;
    }

    this._buffer.clear();
    this._nextSequenceNumber = 0;
    if (this._frameProcessor) {
      this._frameProcessor.reset();
    }
  }

  public isPlaying(): boolean {
    return this._isActive;
  }

  public getHealthMetrics(): IBufferHealthMetrics {
    if (!this._qualityMonitor) {
      return {
        currentBufferMs: this.getCurrentBufferMs(),
        targetBufferMs: this._config.targetBufferMs,
        underrunCount: 0,
        overrunCount: 0,
        averageJitter: 0,
        bufferHealthState: "idle",
        adaptiveAdjustmentsCount: 0,
      };
    }

    const metrics = this._qualityMonitor.getMetrics();
    metrics.currentBufferMs = this.getCurrentBufferMs();
    metrics.bufferHealthState = this._qualityMonitor.getBufferHealthState(
      this._isActive,
      0
    );

    return metrics;
  }

  public updateConfig(config: Partial<IAudioBufferConfig>): void {
    this._config = { ...this._config, ...config };
  }

  public applyAdaptiveAdjustments(): void {
    if (!this._qualityMonitor) {
      return;
    }

    const adjustment = this._qualityMonitor.getRecommendedAdjustment();

    if (adjustment !== 0) {
      const newTargetMs = Math.max(
        this._config.minBufferMs,
        Math.min(
          this._config.maxBufferMs,
          this._config.targetBufferMs + adjustment
        )
      );

      if (newTargetMs !== this._config.targetBufferMs) {
        this.updateConfig({ targetBufferMs: newTargetMs });
      }
    }
  }

  public destroy(): void {
    this.stopPlayback();
    this._buffer.clear();
    this._nextSequenceNumber = 0;
    this._qualityMonitor = null;
    this._frameProcessor = null;
  }

  public getCurrentBufferMs(): number {
    return this._buffer.getTotalDurationMs();
  }

  private _startPlaybackLoop(): void {
    if (!this._isActive) return;

    const currentBufferMs = this.getCurrentBufferMs();
    if (this._qualityMonitor) {
      this._qualityMonitor.updateBufferLevel(currentBufferMs);
    }

    try {
      if (currentBufferMs < this._config.minBufferMs) {
        this._handleUnderrun();
      } else {
        this._scheduleNextFrames();
      }
    } catch {
      /* no-op */
    }

    const nextInterval = this._calculateNextInterval();
    this._playbackTimer = setTimeout(
      () => this._startPlaybackLoop(),
      nextInterval
    );
  }

  private _scheduleNextFrames(): void {
    const currentBufferMs = this.getCurrentBufferMs();
    let maxScheduledFrames = 2;

    if (currentBufferMs > this._config.targetBufferMs) {
      maxScheduledFrames = 3;
    } else if (currentBufferMs < this._config.minBufferMs * 1.5) {
      maxScheduledFrames = 1;
    }

    let scheduledCount = 0;

    while (!this._buffer.isEmpty && scheduledCount < maxScheduledFrames) {
      this._playNextFrame();
      scheduledCount++;
    }
  }

  private _playNextFrame(): void {
    const frame = this._buffer.shift();
    if (!frame) {
      return;
    }

    try {
      // Use the turnId with sequence number suffix for individual frames
      const playbackId = this._currentTurnId
        ? `${this._currentTurnId}-frame-${frame.sequenceNumber}`
        : `buffered-frame-${frame.sequenceNumber}`;

      ExpoPlayAudioStreamModule.playSound(
        frame.data.audioData,
        playbackId,
        this._encoding
      );
      this._lastPlaybackTime = Date.now();
    } catch {
      /* no-op */
    }
  }

  /**
   * Returns buffer utilization percentage for monitoring
   */
  public getBufferUtilization(): number {
    return this._buffer.getUtilization();
  }

  private _handleUnderrun(): void {
    if (this._qualityMonitor) {
      this._qualityMonitor.recordUnderrun();
    }

    this._insertSilenceFrame();
  }

  private _handleOverrun(): void {
    if (this._qualityMonitor) {
      this._qualityMonitor.recordOverrun();
    }

    const excessMs = this.getCurrentBufferMs() - this._config.maxBufferMs;

    if (excessMs > 100) {
      const framesToDrop = Math.floor(excessMs / this._config.frameIntervalMs);
      this._buffer.dropOldest(framesToDrop);
    }
  }

  private _getBytesPerSample(): number {
    if (this._encoding === EncodingTypes.PCM_F32LE) {
      return 4;
    }
    return 2; // Default to 16-bit (2 bytes)
  }

  private _insertSilenceFrame(): void {
    const samplesNeeded = Math.floor(
      (this._config.frameIntervalMs * (this._config.sampleRate ?? 16000)) / 1000
    );
    const bytesNeeded = samplesNeeded * this._getBytesPerSample();

    const silenceBuffer = new ArrayBuffer(bytesNeeded);
    const silenceBase64 = this._arrayBufferToBase64(silenceBuffer);

    const silenceFrame: IAudioFrame = {
      sequenceNumber: this._nextSequenceNumber++,
      data: {
        audioData: silenceBase64,
        isFirst: false,
        isFinal: false,
      },
      duration: this._config.frameIntervalMs,
      timestamp: Date.now(),
    };

    // RingBuffer.unshift adds at the front
    this._buffer.unshift(silenceFrame);
  }

  private _arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binaryString = "";

    for (let i = 0; i < bytes.length; i++) {
      binaryString += String.fromCharCode(bytes[i]);
    }

    if (typeof btoa !== "undefined") {
      return btoa(binaryString);
    }

    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let result = "";
    let i = 0;

    while (i < binaryString.length) {
      const a = binaryString.charCodeAt(i++);
      const b = i < binaryString.length ? binaryString.charCodeAt(i++) : 0;
      const c = i < binaryString.length ? binaryString.charCodeAt(i++) : 0;

      const bitmap = (a << 16) | (b << 8) | c;

      result += chars.charAt((bitmap >> 18) & 63);
      result += chars.charAt((bitmap >> 12) & 63);
      result += chars.charAt((bitmap >> 6) & 63);
      result += chars.charAt(bitmap & 63);
    }

    const padding = (3 - (binaryString.length % 3)) % 3;
    let finalResult = result.slice(0, result.length - padding);
    for (let j = 0; j < padding; j++) {
      finalResult += "=";
    }

    return finalResult;
  }

  private _calculateNextInterval(): number {
    const expectedTime = this._lastPlaybackTime + this._config.frameIntervalMs;
    const currentTime = Date.now();
    const drift = currentTime - expectedTime;

    return Math.max(1, this._config.frameIntervalMs - drift);
  }

  private _waitForBufferFill(targetMs: number): any {
    const self = this;

    return {
      then: function (onResolve: () => void) {
        const checkBuffer = (): void => {
          if (self.getCurrentBufferMs() >= targetMs || !self._isActive) {
            onResolve();
            return;
          }

          setTimeout(checkBuffer, AudioBufferManager._bufferCheckIntervalMs);
        };

        checkBuffer();
      },
    };
  }
}
