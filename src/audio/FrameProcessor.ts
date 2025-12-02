import {
  IAudioPlayPayload,
  IAudioFrame,
  IFrameProcessor,
  AudioDataType,
} from '../types';

/**
 * Processes PCM audio chunks into timestamped frames.
 * Supports both base64 strings and binary data (Uint8Array/ArrayBuffer) for JSI optimization.
 * Validates input, sanitizes data, estimates duration.
 */
export class FrameProcessor implements IFrameProcessor {
  private static readonly _maxReasonableChunkSizeBytes =
    64 * 1024; // 64KB safety
  private static readonly _validBase64Regex =
    /^[A-Za-z0-9+/]*={0,2}$/;

  private _sequenceNumber: number = 0;
  private _frameIntervalMs: number;
  private _sampleRate: number;
  private _bytesPerSample: number;

  constructor(
    frameIntervalMs: number = 20,
    sampleRate: number = 16000,
    bytesPerSample: number = 2
  ) {
    this._frameIntervalMs = frameIntervalMs;
    this._sampleRate = sampleRate;
    this._bytesPerSample = bytesPerSample;
  }

  public setBytesPerSample(bytes: number): void {
    this._bytesPerSample = bytes;
  }

  /** Parse an audio payload into timestamped frames with validation. */
  public parseChunk(
    payload: IAudioPlayPayload
  ): IAudioFrame[] {
    if (!this._isValidPayload(payload)) {
      return [];
    }

    try {
      // Normalize data to base64 string for storage/playback
      const normalizedData = this._normalizeAudioData(payload.audioData);
      const estimatedDuration = this._calculateDuration(normalizedData);

      const frame: IAudioFrame = {
        sequenceNumber: this._sequenceNumber++,
        data: {
          audioData: normalizedData,
          isFirst: payload.isFirst ?? false,
          isFinal: payload.isFinal ?? false,
        },
        duration: estimatedDuration,
        timestamp: Date.now(),
      };

      return [frame];
    } catch (error) {
      // Log error if logging is available, otherwise silently handle
      console.warn(
        'FrameProcessor: Failed to parse chunk:',
        error
      );
      return [];
    }
  }

  /** Reset sequence numbering (on stream restart). */
  public reset(): void {
    this._sequenceNumber = 0;
  }

  /**
   * Normalizes audio data to base64 string format.
   * Supports: string (base64), Uint8Array, ArrayBuffer
   */
  private _normalizeAudioData(data: AudioDataType): string {
    if (typeof data === 'string') {
      return this._sanitizeBase64(data);
    }
    
    // Handle binary data (Uint8Array or ArrayBuffer)
    const bytes = data instanceof ArrayBuffer 
      ? new Uint8Array(data) 
      : data;
    
    return this._binaryToBase64(bytes);
  }

  /**
   * Converts binary data to base64 string.
   * Optimized for performance with batched character conversion.
   */
  private _binaryToBase64(bytes: Uint8Array): string {
    // Use native btoa if available (browser/React Native)
    if (typeof btoa !== 'undefined') {
      let binaryString = '';
      const len = bytes.length;
      // Process in chunks to avoid call stack size exceeded for large arrays
      const chunkSize = 8192;
      for (let i = 0; i < len; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
        for (let j = 0; j < chunk.length; j++) {
          binaryString += String.fromCharCode(chunk[j]);
        }
      }
      return btoa(binaryString);
    }

    // Fallback manual base64 encoding
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let result = '';
    const len = bytes.length;
    
    for (let i = 0; i < len; i += 3) {
      const a = bytes[i];
      const b = i + 1 < len ? bytes[i + 1] : 0;
      const c = i + 2 < len ? bytes[i + 2] : 0;
      
      const bitmap = (a << 16) | (b << 8) | c;
      
      result += chars.charAt((bitmap >> 18) & 63);
      result += chars.charAt((bitmap >> 12) & 63);
      result += i + 1 < len ? chars.charAt((bitmap >> 6) & 63) : '=';
      result += i + 2 < len ? chars.charAt(bitmap & 63) : '=';
    }
    
    return result;
  }

  /**
   * Gets the byte size of audio data regardless of format.
   */
  private _getByteSize(data: AudioDataType): number {
    if (typeof data === 'string') {
      // Estimate decoded size from base64
      const paddingCount = (data.match(/=/g) || []).length;
      return (data.length * 3) / 4 - paddingCount;
    }
    
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    
    return data.length; // Uint8Array
  }

  /** Validate payload structure and content. */
  private _isValidPayload(
    payload: IAudioPlayPayload
  ): boolean {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    if (!payload.audioData) {
      return false;
    }

    // Validate data type
    const isValidType = 
      typeof payload.audioData === 'string' ||
      payload.audioData instanceof Uint8Array ||
      payload.audioData instanceof ArrayBuffer;
    
    if (!isValidType) {
      return false;
    }

    // Check for empty data
    const byteSize = this._getByteSize(payload.audioData);
    if (byteSize === 0) {
      return false;
    }

    // Safety check for oversized chunks
    if (byteSize > FrameProcessor._maxReasonableChunkSizeBytes) {
      console.warn(
        'FrameProcessor: Chunk size exceeds reasonable limit:',
        byteSize
      );
      return false;
    }

    return true;
  }

  /** Clean and validate base64 string. */
  private _sanitizeBase64(base64Data: string): string {
    if (!base64Data) {
      throw new Error('Empty base64 data');
    }

    // Remove any whitespace
    const cleaned = base64Data.replace(/\s/g, '');

    // Basic format validation
    if (!FrameProcessor._validBase64Regex.test(cleaned)) {
      throw new Error('Invalid base64 format');
    }

    // Ensure proper padding
    const remainder = cleaned.length % 4;
    if (remainder === 2) {
      return cleaned + '==';
    } else if (remainder === 3) {
      return cleaned + '=';
    }

    return cleaned;
  }

  /** Estimate frame duration from base64 PCM data. */
  private _calculateDuration(base64Data: string): number {
    try {
      // Estimate decoded byte count
      const paddingCount = (base64Data.match(/=/g) || [])
        .length;
      const estimatedBytes =
        (base64Data.length * 3) / 4 - paddingCount;

      // Convert bytes to samples to duration
      const sampleCount =
        estimatedBytes / this._bytesPerSample;
      const durationMs =
        (sampleCount / this._sampleRate) * 1000;

      // Sanity check and fallback to frame interval
      if (durationMs <= 0 || durationMs > 1000) {
        console.warn(
          'FrameProcessor: Calculated duration out of range, using frame interval:',
          durationMs
        );
        return this._frameIntervalMs;
      }

      return Math.round(durationMs);
    } catch (error) {
      console.warn(
        'FrameProcessor: Duration calculation failed, using frame interval:',
        error
      );
      return this._frameIntervalMs;
    }
  }
}
