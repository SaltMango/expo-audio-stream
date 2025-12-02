import { Subscription } from 'expo-modules-core';
import ExpoPlayAudioStreamModule from './ExpoPlayAudioStreamModule';
import {
  AudioDataEvent,
  AudioRecording,
  RecordingConfig,
  StartRecordingResult,
  SoundConfig,
  PlaybackMode,
  Encoding,
  EncodingTypes,
  PlaybackModes,
  // Audio jitter buffer types
  IAudioBufferConfig,
  IAudioPlayPayload,
  IAudioFrame,
  BufferHealthState,
  IBufferHealthMetrics,
  IAudioBufferManager,
  IFrameProcessor,
  IQualityMonitor,
  BufferedStreamConfig,
  SmartBufferConfig,
  SmartBufferMode,
  NetworkConditions,
  AudioDataType,
  // Production telemetry types
  IAudioTelemetry,
  IRetryConfig,
  DEFAULT_RETRY_CONFIG,
  TelemetryCallback,
} from './types';

import { AudioBufferManager } from './audio';
import { BufferManagerAdaptive } from './audio/BufferManagerAdaptive';

import {
  addAudioEventListener,
  addSoundChunkPlayedListener,
  AudioEventPayload,
  SoundChunkPlayedEventPayload,
  AudioEvents,
  subscribeToEvent,
  DeviceReconnectedReason,
  DeviceReconnectedEventPayload,
} from './events';

const SuspendSoundEventTurnId = 'suspend-sound-events';

export class ExpoPlayAudioStream {
  // Static buffer manager instances for different turn IDs
  private static _bufferManagers: {
    [turnId: string]: IAudioBufferManager;
  } = {};

  /**
   * Destroys the audio stream module, cleaning up all resources.
   * This should be called when the module is no longer needed.
   * It will reset all internal state and release audio resources.
   */
  static destroy() {
    // Clean up all health monitor intervals
    Object.keys(
      ExpoPlayAudioStream._healthMonitorIntervals
    ).forEach((turnId) => {
      clearInterval(ExpoPlayAudioStream._healthMonitorIntervals[turnId]);
    });
    ExpoPlayAudioStream._healthMonitorIntervals = {};

    // Clean up all buffer managers
    Object.keys(
      ExpoPlayAudioStream._bufferManagers
    ).forEach((turnId) => {
      ExpoPlayAudioStream._bufferManagers[turnId].destroy();
    });
    ExpoPlayAudioStream._bufferManagers = {};

    ExpoPlayAudioStreamModule.destroy();
  }

  /**
   * Starts microphone recording.
   * @param {RecordingConfig} recordingConfig - Configuration for the recording.
   * @returns {Promise<{recordingResult: StartRecordingResult, subscription: Subscription}>} A promise that resolves to an object containing the recording result and a subscription to audio events.
   * @throws {Error} If the recording fails to start.
   */
  static async startRecording(
    recordingConfig: RecordingConfig
  ): Promise<{
    recordingResult: StartRecordingResult;
    subscription?: Subscription;
  }> {
    const { onAudioStream, ...options } = recordingConfig;

    let subscription: Subscription | undefined;

    if (
      onAudioStream &&
      typeof onAudioStream == 'function'
    ) {
      subscription = addAudioEventListener(
        async (event: AudioEventPayload) => {
          const {
            fileUri,
            deltaSize,
            totalSize,
            position,
            encoded,
            soundLevel,
          } = event;
          if (!encoded) {
            console.error(
              `[ExpoPlayAudioStream] Encoded audio data is missing`
            );
            throw new Error(
              'Encoded audio data is missing'
            );
          }
          onAudioStream?.({
            data: encoded,
            position,
            fileUri,
            eventDataSize: deltaSize,
            totalSize,
            soundLevel,
          });
        }
      );
    }

    try {
      const recordingResult =
        await ExpoPlayAudioStreamModule.startRecording(
          options
        );
      return { recordingResult, subscription };
    } catch (error) {
      console.error(error);
      subscription?.remove();
      throw new Error(
        `Failed to start recording: ${error}`
      );
    }
  }

  /**
   * Stops the current microphone recording.
   * @returns {Promise<AudioRecording>} A promise that resolves to the audio recording data.
   * @throws {Error} If the recording fails to stop.
   */
  static async stopRecording(): Promise<AudioRecording> {
    try {
      return await ExpoPlayAudioStreamModule.stopRecording();
    } catch (error) {
      console.error(error);
      throw new Error(`Failed to stop recording: ${error}`);
    }
  }

  /**
   * Plays an audio chunk.
   * @param {string} base64Chunk - The base64 encoded audio chunk to play.
   * @param {string} turnId - The turn ID.
   * @param {string} [encoding] - The encoding format of the audio data ('pcm_f32le' or 'pcm_s16le').
   * @returns {Promise<void>}
   * @throws {Error} If the audio chunk fails to stream.
   */
  static async playAudio(
    base64Chunk: string,
    turnId: string,
    encoding?: Encoding
  ): Promise<void> {
    try {
      return ExpoPlayAudioStreamModule.playAudio(
        base64Chunk,
        turnId,
        encoding ?? EncodingTypes.PCM_S16LE
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        `Failed to stream audio chunk: ${error}`
      );
    }
  }

  /**
   * Pauses the current audio playback.
   * @returns {Promise<void>}
   * @throws {Error} If the audio playback fails to pause.
   */
  static async pauseAudio(): Promise<void> {
    try {
      return await ExpoPlayAudioStreamModule.pauseAudio();
    } catch (error) {
      console.error(error);
      throw new Error(`Failed to pause audio: ${error}`);
    }
  }

  /**
   * Stops the currently playing audio.
   * @returns {Promise<void>}
   * @throws {Error} If the audio fails to stop.
   */
  static async stopAudio(): Promise<void> {
    try {
      return await ExpoPlayAudioStreamModule.stopAudio();
    } catch (error) {
      console.error(error);
      throw new Error(`Failed to stop audio: ${error}`);
    }
  }

  /**
   * Clears the playback queue by turn ID.
   * @param {string} turnId - The turn ID.
   * @returns {Promise<void>}
   * @throws {Error} If the playback queue fails to clear.
   */
  static async clearPlaybackQueueByTurnId(
    turnId: string
  ): Promise<void> {
    try {
      await ExpoPlayAudioStreamModule.clearPlaybackQueueByTurnId(
        turnId
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        `Failed to clear playback queue: ${error}`
      );
    }
  }

  /**
   * Plays a sound.
   * @param {string} audio - The audio to play.
   * @param {string} turnId - The turn ID.
   * @param {string} [encoding] - The encoding format of the audio data ('pcm_f32le' or 'pcm_s16le').
   * @returns {Promise<void>}
   * @throws {Error} If the sound fails to play.
   */
  static async playSound(
    audio: string,
    turnId: string,
    encoding?: Encoding
  ): Promise<void> {
    try {
      await ExpoPlayAudioStreamModule.playSound(
        audio,
        turnId,
        encoding ?? EncodingTypes.PCM_S16LE
      );
    } catch (error) {
      console.error(error);
      throw new Error(`Failed to enqueue audio: ${error}`);
    }
  }

  /**
   * Stops the currently playing sound.
   * @returns {Promise<void>}
   * @throws {Error} If the sound fails to stop.
   */
  static async stopSound(): Promise<void> {
    try {
      await ExpoPlayAudioStreamModule.stopSound();
    } catch (error) {
      console.error(error);
      throw new Error(
        `Failed to stop enqueued audio: ${error}`
      );
    }
  }

  /**
   * Interrupts the current sound.
   * @returns {Promise<void>}
   * @throws {Error} If the sound fails to interrupt.
   */
  static async interruptSound(): Promise<void> {
    try {
      await ExpoPlayAudioStreamModule.interruptSound();
    } catch (error) {
      console.error(error);
      throw new Error(
        `Failed to stop enqueued audio: ${error}`
      );
    }
  }

  /**
   * Resumes the current sound.
   * @returns {Promise<void>}
   * @throws {Error} If the sound fails to resume.
   */
  static resumeSound(): void {
    try {
      ExpoPlayAudioStreamModule.resumeSound();
    } catch (error) {
      console.error(error);
      throw new Error(`Failed to resume sound: ${error}`);
    }
  }

  /**
   * Clears the sound queue by turn ID.
   * @param {string} turnId - The turn ID.
   * @returns {Promise<void>}
   * @throws {Error} If the sound queue fails to clear.
   */
  static async clearSoundQueueByTurnId(
    turnId: string
  ): Promise<void> {
    try {
      await ExpoPlayAudioStreamModule.clearSoundQueueByTurnId(
        turnId
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        `Failed to clear sound queue: ${error}`
      );
    }
  }

  // ============ BUFFERED AUDIO METHODS ============

  // Store health monitor intervals for cleanup
  private static _healthMonitorIntervals: {
    [turnId: string]: ReturnType<typeof setInterval>;
  } = {};

  /**
   * Starts a buffered audio stream for a specific turn ID.
   * This enables jitter buffering for improved audio quality on unreliable networks.
   * @param {BufferedStreamConfig} config - Configuration for the buffered stream.
   * @returns {Promise<void>}
   * @throws {Error} If the buffered stream fails to start.
   */
  static async startBufferedAudioStream(
    config: BufferedStreamConfig
  ): Promise<void> {
    try {
      // Clean up any existing stream for this turnId
      if (ExpoPlayAudioStream._bufferManagers[config.turnId]) {
        console.warn(
          `[ExpoPlayAudioStream] Replacing existing stream for turnId: ${config.turnId}`
        );
        await ExpoPlayAudioStream.stopBufferedAudioStream(config.turnId);
      }

      let bufferManager: IAudioBufferManager;

      if (config.smartBufferConfig) {
        bufferManager = new BufferManagerAdaptive(
          config.smartBufferConfig,
          config.turnId,
          config.encoding
        );
        if (config.bufferConfig) {
          bufferManager.updateConfig(config.bufferConfig);
        }
      } else {
        // Merge sampleRate from bufferConfig if provided
        const mergedConfig = {
          ...config.bufferConfig,
        };
        const simpleManager = new AudioBufferManager(mergedConfig);
        simpleManager.setTurnId(config.turnId);
        if (config.encoding) {
          simpleManager.setEncoding(config.encoding);
        }
        bufferManager = simpleManager;
      }

      // Store the buffer manager for this turn ID BEFORE starting playback
      ExpoPlayAudioStream._bufferManagers[config.turnId] = bufferManager;

      // Start buffered playback
      bufferManager.startPlayback();

      console.log(
        `[ExpoPlayAudioStream] Started buffered stream for turnId: ${config.turnId}`
      );

      // Set up health monitoring if callback provided
      if (config.onBufferHealth) {
        const healthCallback = config.onBufferHealth;
        const intervalId = setInterval(() => {
          const manager = ExpoPlayAudioStream._bufferManagers[config.turnId];
          if (manager) {
            healthCallback(manager.getHealthMetrics());
          } else {
            // Clean up interval if manager no longer exists
            clearInterval(intervalId);
            delete ExpoPlayAudioStream._healthMonitorIntervals[config.turnId];
          }
        }, 1000); // Report health every second
        
        // Store interval for cleanup
        ExpoPlayAudioStream._healthMonitorIntervals[config.turnId] = intervalId;
      }
    } catch (error) {
      console.error('[ExpoPlayAudioStream] Failed to start buffered stream:', error);
      // Clean up on failure
      delete ExpoPlayAudioStream._bufferManagers[config.turnId];
      throw new Error(
        `Failed to start buffered audio stream: ${error}`
      );
    }
  }

  /**
   * Plays audio with jitter buffering for a specific turn ID.
   * The stream must be started first with startBufferedAudioStream().
   * @param {string | Uint8Array | ArrayBuffer} audioData - Audio data (base64 string or binary).
   * @param {string} turnId - The turn ID for the stream.
   * @param {boolean} isFirst - Whether this is the first chunk.
   * @param {boolean} isFinal - Whether this is the final chunk.
   * @returns {Promise<void>}
   * @throws {Error} If the audio chunk fails to buffer or the stream is not started.
   */
  static async playAudioBuffered(
    audioData: string | Uint8Array | ArrayBuffer,
    turnId: string,
    isFirst?: boolean,
    isFinal?: boolean
  ): Promise<void> {
    try {
      const bufferManager =
        ExpoPlayAudioStream._bufferManagers[turnId];
      if (!bufferManager) {
        // List available turnIds for debugging
        const availableTurnIds = Object.keys(ExpoPlayAudioStream._bufferManagers);
        console.error(
          `[ExpoPlayAudioStream] No buffered stream for turnId: ${turnId}. Available: [${availableTurnIds.join(', ')}]`
        );
        throw new Error(
          `No buffered stream found for turnId: ${turnId}. Call startBufferedAudioStream() first.`
        );
      }

      // Handle empty final chunk (flush signal)
      if (isFinal && this._isEmptyData(audioData)) {
        // Just mark the stream as complete, don't enqueue empty data
        console.log(`[ExpoPlayAudioStream] Received final flush signal for turnId: ${turnId}`);
        return;
      }

      const audioPayload: IAudioPlayPayload = {
        audioData: audioData,
        isFirst: isFirst ?? false,
        isFinal: isFinal ?? false,
      };

      bufferManager.enqueueFrames(audioPayload);
    } catch (error) {
      console.error('[ExpoPlayAudioStream] playAudioBuffered error:', error);
      throw new Error(
        `Failed to play buffered audio: ${error}`
      );
    }
  }

  /**
   * Check if audio data is empty
   */
  private static _isEmptyData(data: string | Uint8Array | ArrayBuffer): boolean {
    if (typeof data === 'string') {
      return data.length === 0;
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength === 0;
    }
    if (data instanceof Uint8Array) {
      return data.length === 0;
    }
    return true;
  }

  // ============ JSI BINARY DATA METHODS ============

  /**
   * JSI Binary: Plays audio directly from Uint8Array (zero-copy path).
   * This bypasses Base64 encoding/decoding for ~33% less overhead and better performance.
   * @param {Uint8Array} audioData - Raw PCM audio data as Uint8Array.
   * @param {string} turnId - The turn ID.
   * @param {string} [encoding] - The encoding format ('pcm_f32le' or 'pcm_s16le').
   * @returns {Promise<void>}
   * @throws {Error} If the audio fails to play.
   */
  static async playSoundBinary(
    audioData: Uint8Array,
    turnId: string,
    encoding?: Encoding
  ): Promise<void> {
    try {
      // Check if native module supports binary playback
      if (typeof ExpoPlayAudioStreamModule.playSoundBinary === 'function') {
        await ExpoPlayAudioStreamModule.playSoundBinary(
          audioData,
          turnId,
          encoding ?? EncodingTypes.PCM_S16LE
        );
      } else {
        // Fallback to base64 if binary not supported
        console.warn('[ExpoPlayAudioStream] playSoundBinary not available, falling back to base64');
        const base64 = ExpoPlayAudioStream._uint8ArrayToBase64(audioData);
        await ExpoPlayAudioStreamModule.playSound(
          base64,
          turnId,
          encoding ?? EncodingTypes.PCM_S16LE
        );
      }
    } catch (error) {
      console.error('[ExpoPlayAudioStream] playSoundBinary error:', error);
      throw new Error(`Failed to play binary audio: ${error}`);
    }
  }

  /**
   * Converts Uint8Array to base64 string (fallback for older native modules)
   */
  private static _uint8ArrayToBase64(bytes: Uint8Array): string {
    if (typeof btoa !== 'undefined') {
      let binaryString = '';
      const len = bytes.length;
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
   * Stops a buffered audio stream for a specific turn ID.
   * @param {string} turnId - The turn ID for the stream to stop.
   * @returns {Promise<void>}
   * @throws {Error} If the buffered stream fails to stop.
   */
  static async stopBufferedAudioStream(
    turnId: string
  ): Promise<void> {
    try {
      // Clean up health monitor interval
      const intervalId = ExpoPlayAudioStream._healthMonitorIntervals[turnId];
      if (intervalId) {
        clearInterval(intervalId);
        delete ExpoPlayAudioStream._healthMonitorIntervals[turnId];
      }

      const bufferManager =
        ExpoPlayAudioStream._bufferManagers[turnId];
      if (bufferManager) {
        bufferManager.stopPlayback();
        bufferManager.destroy();
        delete ExpoPlayAudioStream._bufferManagers[turnId];
      }

      // Also clear the native queue for this turn ID
      await ExpoPlayAudioStreamModule.clearSoundQueueByTurnId(
        turnId
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        `Failed to stop buffered audio stream: ${error}`
      );
    }
  }

  /**
   * Gets buffer health metrics for a specific turn ID.
   * @param {string} turnId - The turn ID for the stream.
   * @returns {IBufferHealthMetrics | null} Buffer health metrics or null if stream not found.
   */
  static getBufferHealthMetrics(
    turnId: string
  ): IBufferHealthMetrics | null {
    const bufferManager =
      ExpoPlayAudioStream._bufferManagers[turnId];
    return bufferManager
      ? bufferManager.getHealthMetrics()
      : null;
  }

  /**
   * Checks if a buffered audio stream is currently playing.
   * @param {string} turnId - The turn ID for the stream.
   * @returns {boolean} True if the stream is playing, false otherwise.
   */
  static isBufferedAudioStreamPlaying(
    turnId: string
  ): boolean {
    const bufferManager =
      ExpoPlayAudioStream._bufferManagers[turnId];
    return bufferManager
      ? bufferManager.isPlaying()
      : false;
  }

  /**
   * Updates buffer configuration for a specific turn ID.
   * @param {string} turnId - The turn ID for the stream.
   * @param {Partial<IAudioBufferConfig>} config - New buffer configuration.
   * @returns {Promise<void>}
   */
  static async updateBufferedAudioConfig(
    turnId: string,
    config: Partial<IAudioBufferConfig>
  ): Promise<void> {
    try {
      const bufferManager =
        ExpoPlayAudioStream._bufferManagers[turnId];
      if (bufferManager) {
        bufferManager.updateConfig(config);
        bufferManager.applyAdaptiveAdjustments();
      }
    } catch (error) {
      console.error(error);
      throw new Error(
        `Failed to update buffer config: ${error}`
      );
    }
  }

  // ============ END BUFFERED AUDIO METHODS ============

  /**
   * Starts microphone streaming.
   * @param {RecordingConfig} recordingConfig - The recording configuration.
   * @returns {Promise<{recordingResult: StartRecordingResult, subscription: Subscription}>} A promise that resolves to an object containing the recording result and a subscription to audio events.
   * @throws {Error} If the recording fails to start.
   */
  static async startMicrophone(
    recordingConfig: RecordingConfig
  ): Promise<{
    recordingResult: StartRecordingResult;
    subscription?: Subscription;
  }> {
    let subscription: Subscription | undefined;
    try {
      const { onAudioStream, ...options } = recordingConfig;

      if (
        onAudioStream &&
        typeof onAudioStream == 'function'
      ) {
        subscription = addAudioEventListener(
          async (event: AudioEventPayload) => {
            const {
              fileUri,
              deltaSize,
              totalSize,
              position,
              encoded,
              soundLevel,
            } = event;
            if (!encoded) {
              console.error(
                `[ExpoPlayAudioStream] Encoded audio data is missing`
              );
              throw new Error(
                'Encoded audio data is missing'
              );
            }
            onAudioStream?.({
              data: encoded,
              position,
              fileUri,
              eventDataSize: deltaSize,
              totalSize,
              soundLevel,
            });
          }
        );
      }

      const result =
        await ExpoPlayAudioStreamModule.startMicrophone(
          options
        );

      return { recordingResult: result, subscription };
    } catch (error) {
      console.error(error);
      subscription?.remove();
      throw new Error(
        `Failed to start recording: ${error}`
      );
    }
  }

  /**
   * Stops the current microphone streaming.
   * @returns {Promise<void>}
   * @throws {Error} If the microphone streaming fails to stop.
   */
  static async stopMicrophone(): Promise<AudioRecording | null> {
    try {
      return await ExpoPlayAudioStreamModule.stopMicrophone();
    } catch (error) {
      console.error(error);
      throw new Error(
        `Failed to stop mic stream: ${error}`
      );
    }
  }

  /**
   * Subscribes to audio events emitted during recording/streaming.
   * @param onMicrophoneStream - Callback function that will be called when audio data is received.
   * The callback receives an AudioDataEvent containing:
   * - data: Base64 encoded audio data at original sample rate
   * - data16kHz: Optional base64 encoded audio data resampled to 16kHz
   * - position: Current position in the audio stream
   * - fileUri: URI of the recording file
   * - eventDataSize: Size of the current audio data chunk
   * - totalSize: Total size of recorded audio so far
   * @returns {Subscription} A subscription object that can be used to unsubscribe from the events
   * @throws {Error} If encoded audio data is missing from the event
   */
  static subscribeToAudioEvents(
    onMicrophoneStream: (
      event: AudioDataEvent
    ) => Promise<void>
  ): Subscription {
    return addAudioEventListener(
      async (event: AudioEventPayload) => {
        const {
          fileUri,
          deltaSize,
          totalSize,
          position,
          encoded,
          soundLevel,
        } = event;
        if (!encoded) {
          console.error(
            `[ExpoPlayAudioStream] Encoded audio data is missing`
          );
          throw new Error('Encoded audio data is missing');
        }
        onMicrophoneStream?.({
          data: encoded,
          position,
          fileUri,
          eventDataSize: deltaSize,
          totalSize,
          soundLevel,
        });
      }
    );
  }

  /**
   * Subscribes to events emitted when a sound chunk has finished playing.
   * @param onSoundChunkPlayed - Callback function that will be called when a sound chunk is played.
   * The callback receives a SoundChunkPlayedEventPayload indicating if this was the final chunk.
   * @returns {Subscription} A subscription object that can be used to unsubscribe from the events.
   */
  static subscribeToSoundChunkPlayed(
    onSoundChunkPlayed: (
      event: SoundChunkPlayedEventPayload
    ) => Promise<void>
  ): Subscription {
    return addSoundChunkPlayedListener(onSoundChunkPlayed);
  }

  /**
   * Subscribes to events emitted by the audio stream module, for advanced use cases.
   * @param eventName - The name of the event to subscribe to.
   * @param onEvent - Callback function that will be called when the event is emitted.
   * @returns {Subscription} A subscription object that can be used to unsubscribe from the events.
   */
  static subscribe<T extends unknown>(
    eventName: string,
    onEvent: (event: T | undefined) => Promise<void>
  ): Subscription {
    return subscribeToEvent(eventName, onEvent);
  }

  /**
   * Plays a WAV audio file from base64 encoded data.
   * Unlike playSound(), this method plays the audio directly without queueing.
   * @param {string} wavBase64 - Base64 encoded WAV audio data.
   * @returns {Promise<void>}
   * @throws {Error} If the WAV audio fails to play.
   */
  static async playWav(wavBase64: string) {
    try {
      await ExpoPlayAudioStreamModule.playWav(wavBase64);
    } catch (error) {
      console.error(error);
      throw new Error(`Failed to play wav: ${error}`);
    }
  }

  /**
   * Sets the sound player configuration.
   * @param {SoundConfig} config - Configuration options for the sound player.
   * @returns {Promise<void>}
   * @throws {Error} If the configuration fails to update.
   */
  static async setSoundConfig(
    config: SoundConfig
  ): Promise<void> {
    try {
      await ExpoPlayAudioStreamModule.setSoundConfig(
        config
      );
    } catch (error) {
      console.error(error);
      throw new Error(
        `Failed to set sound configuration: ${error}`
      );
    }
  }

  /**
   * Prompts the user to select the microphone mode.
   * @returns {Promise<void>}
   * @throws {Error} If the microphone mode fails to prompt.
   */
  static promptMicrophoneModes() {
    ExpoPlayAudioStreamModule.promptMicrophoneModes();
  }

  /**
   * Toggles the silence state of the microphone.
   * @returns {Promise<void>}
   * @throws {Error} If the microphone fails to toggle silence.
   */
  static toggleSilence() {
    ExpoPlayAudioStreamModule.toggleSilence();
  }
}

export {
  AudioDataEvent,
  SoundChunkPlayedEventPayload,
  DeviceReconnectedReason,
  DeviceReconnectedEventPayload,
  AudioRecording,
  RecordingConfig,
  StartRecordingResult,
  AudioEvents,
  SuspendSoundEventTurnId,
  SoundConfig,
  PlaybackMode,
  Encoding,
  EncodingTypes,
  PlaybackModes,
  // Audio jitter buffer types
  IAudioBufferConfig,
  IAudioPlayPayload,
  IAudioFrame,
  BufferHealthState,
  IBufferHealthMetrics,
  IAudioBufferManager,
  IFrameProcessor,
  IQualityMonitor,
  BufferedStreamConfig,
  SmartBufferConfig,
  SmartBufferMode,
  NetworkConditions,
  AudioDataType,
  // Production telemetry types
  IAudioTelemetry,
  IRetryConfig,
  DEFAULT_RETRY_CONFIG,
  TelemetryCallback,
};

// Export audio processing modules
export {
  AudioBufferManager,
  FrameProcessor,
  QualityMonitor,
  SmartBufferManager,
  RingBuffer,
  // Production utilities
  TelemetryManager,
  RetryHandler,
  defaultRetryHandler,
} from './audio';
