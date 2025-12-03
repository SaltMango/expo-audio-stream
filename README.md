# Expo Play Audio Stream 🎶

> **Enhanced Fork**: This is a production-ready fork of [mykin-ai/expo-audio-stream](https://github.com/mykin-ai/expo-audio-stream), with additional features and improvements by SaltMango.

The Expo Play Audio Stream module is a powerful tool for recording and streaming audio data in your Expo-based React Native applications. It provides a seamless way to record audio from the microphone and play audio chunks in real-time, allowing you to build audio-centric features like voice assistants, audio players, voice recorders, and more.

## Quick Start 🚀

```javascript
import {
  ExpoPlayAudioStream,
  PlaybackModes,
} from "@saltmango/expo-audio-stream";

// Configure for conversational AI
await ExpoPlayAudioStream.setSoundConfig({
  sampleRate: 24000,
  playbackMode: PlaybackModes.CONVERSATION, // Enables hardware AEC
});

// Start adaptive buffering
await ExpoPlayAudioStream.startBufferedAudioStream({
  turnId: "my-turn",
  encoding: "pcm_s16le",
  smartBufferConfig: { mode: "adaptive" },
  onBufferHealth: (metrics) => console.log("Buffer:", metrics),
});

// Stream audio chunks
await ExpoPlayAudioStream.playAudioBuffered(audioChunk, "my-turn");
```

## Motivation 🎯

Expo's built-in audio capabilities are limited to playing pre-loaded audio files and basic recording. The Expo Audio Stream module addresses these limitations with production-ready features for real-time audio streaming, intelligent buffering, and hardware-accelerated audio processing. Key innovations include adaptive buffering that adjusts to network conditions, hardware echo cancellation for voice applications, and memory-optimized data structures for consistent performance.

## Example Usage 🚀

Here's how you can use the Expo Play Audio Stream module for different scenarios:

### 🚀 Production Ready: Adaptive Buffering with Voice Processing (Recommended)

For production conversational AI applications with automatic audio quality optimization:

```javascript
import {
  ExpoPlayAudioStream,
  EncodingTypes,
  PlaybackModes,
} from "@saltmango/expo-audio-stream";

// Production-ready setup with adaptive buffering and voice quality
async function startConversationalAI() {
  try {
    // 1. Configure for high-quality voice communication
    await ExpoPlayAudioStream.setSoundConfig({
      sampleRate: 24000, // 24kHz for high-quality voice
      playbackMode: PlaybackModes.CONVERSATION, // Enables hardware AEC
    });

    // 2. Start adaptive buffered audio stream
    await ExpoPlayAudioStream.startBufferedAudioStream({
      turnId: "conversation-turn-1",
      encoding: EncodingTypes.PCM_S16LE,
      bufferConfig: {
        targetBufferMs: 100, // Low latency for conversation
        minBufferMs: 50,
        maxBufferMs: 300,
        frameIntervalMs: 40,
      },
      smartBufferConfig: {
        mode: "adaptive",
        networkConditions: {
          latency: 50, // Current network latency in ms
          jitter: 20, // Network jitter in ms
        },
      },
      onBufferHealth: (metrics) => {
        // Monitor buffer health for production telemetry
        if (metrics.underrunCount > 0) {
          console.warn("⚠️ Buffer underruns detected:", metrics);
        }
        console.log("📊 Buffer health:", {
          state: metrics.bufferHealthState,
          currentMs: metrics.currentBufferMs,
          utilization: Math.round((metrics.currentBufferMs / 300) * 100) + "%",
        });
      },
    });

    // 3. Stream audio chunks as they arrive
    async function streamAudioChunk(
      base64Audio: string,
      isFirst: boolean,
      isFinal: boolean
    ) {
      await ExpoPlayAudioStream.playAudioBuffered(
        base64Audio,
        "conversation-turn-1",
        isFirst,
        isFinal
      );
    }

    // 4. Handle turn completion
    async function completeTurn() {
      await ExpoPlayAudioStream.stopBufferedAudioStream("conversation-turn-1");
    }
  } catch (error) {
    console.error("Conversational AI setup failed:", error);
  }
}
```

### 🎯 Production Ready: Simultaneous Recording & Playback

For real-time voice processing with hardware echo cancellation:

```javascript
import {
  ExpoPlayAudioStream,
  EncodingTypes,
  PlaybackModes,
} from "@saltmango/expo-audio-stream";

// Production setup for simultaneous record/playback with AEC
async function startVoiceProcessing() {
  try {
    // Configure for voice processing mode (enables AEC)
    await ExpoPlayAudioStream.setSoundConfig({
      sampleRate: 24000,
      playbackMode: PlaybackModes.VOICE_PROCESSING, // Hardware AEC enabled
    });

    // Start microphone with real-time processing
    const { recordingResult, subscription } =
      await ExpoPlayAudioStream.startMicrophone({
        sampleRate: 24000,
        channels: 1,
        encoding: EncodingTypes.PCM_S16LE,
        interval: 100, // 100ms chunks for low latency
        onAudioStream: (event) => {
          // Process audio in real-time
          console.log("🎤 Audio chunk received:", {
            size: event.eventDataSize,
            soundLevel: event.soundLevel,
          });

          // Forward to speech recognition or processing
          processAudioForSpeech(event.data);
        },
      });

    // Play responses while recording continues
    await ExpoPlayAudioStream.playSound(
      responseAudioBase64,
      "response-turn-1",
      EncodingTypes.PCM_S16LE
    );
  } catch (error) {
    console.error("Voice processing failed:", error);
    subscription?.remove();
  }
}
```

### 🧠 Binary Data Transfer (JSI Performance)

For maximum performance with large audio files:

```javascript
import {
  ExpoPlayAudioStream,
  EncodingTypes,
} from "@saltmango/expo-audio-stream";

// Use binary data instead of base64 for better performance
async function processBinaryAudio() {
  // Convert your audio data to binary format
  const audioBuffer = await loadAudioBuffer(); // Your binary audio data
  const uint8Array = new Uint8Array(audioBuffer);

  // Play binary audio data directly (no base64 conversion)
  await ExpoPlayAudioStream.playSound(
    uint8Array, // Binary data - faster than base64
    "binary-turn-1",
    EncodingTypes.PCM_S16LE
  );

  // Or use ArrayBuffer
  const arrayBuffer = await fetchAudioData();
  await ExpoPlayAudioStream.playSound(
    arrayBuffer, // Also supported
    "buffer-turn-1",
    EncodingTypes.PCM_F32LE
  );
}
```

### 📱 Legacy: Standard Recording and Playback

```javascript
import {
  ExpoPlayAudioStream,
  EncodingTypes,
  PlaybackModes,
} from "@saltmango/expo-audio-stream";

// Example of standard recording and playback with specific encoding
async function handleStandardRecording() {
  try {
    // Configure sound playback settings
    await ExpoPlayAudioStream.setSoundConfig({
      sampleRate: 44100,
      playbackMode: PlaybackModes.REGULAR,
    });

    // Start recording with configuration
    const { recordingResult, subscription } =
      await ExpoPlayAudioStream.startRecording({
        sampleRate: 48000,
        channels: 1,
        encoding: "pcm_16bit",
        interval: 250, // milliseconds
        onAudioStream: (event) => {
          console.log("Received audio stream:", {
            audioDataBase64: event.data,
            position: event.position,
            eventDataSize: event.eventDataSize,
            totalSize: event.totalSize,
            soundLevel: event.soundLevel, // New property for audio level monitoring
          });
        },
      });

    // After some time, stop recording
    setTimeout(async () => {
      const recording = await ExpoPlayAudioStream.stopRecording();
      console.log("Recording stopped:", recording);

      // Play the recorded audio with specific encoding format
      const turnId = "example-turn-1";
      await ExpoPlayAudioStream.playAudio(
        base64Content,
        turnId,
        EncodingTypes.PCM_S16LE
      );

      // Clean up
      subscription?.remove();
    }, 5000);
  } catch (error) {
    console.error("Audio handling error:", error);
  }
}

// You can also subscribe to audio events from anywhere
const audioSubscription = ExpoPlayAudioStream.subscribeToAudioEvents(
  async (event) => {
    console.log("Audio event received:", {
      data: event.data,
      soundLevel: event.soundLevel, // Sound level can be used for visualization or voice detection
    });
  }
);
// Don't forget to clean up when done
// audioSubscription.remove();
```

### Simultaneous Recording and Playback

These methods are designed for scenarios where you need to record and play audio at the same time:

```javascript
import {
  ExpoPlayAudioStream,
  EncodingTypes,
  PlaybackModes,
} from "@saltmango/expo-audio-stream";

// Example of simultaneous recording and playback with voice processing
async function handleSimultaneousRecordAndPlay() {
  try {
    // Configure sound playback with optimized voice processing settings
    await ExpoPlayAudioStream.setSoundConfig({
      sampleRate: 44100,
      playbackMode: PlaybackModes.VOICE_PROCESSING,
    });

    // Start microphone with voice processing
    const { recordingResult, subscription } =
      await ExpoPlayAudioStream.startMicrophone({
        enableProcessing: true,
        onAudioStream: (event) => {
          console.log("Received audio stream with voice processing:", {
            audioDataBase64: event.data,
            soundLevel: event.soundLevel,
          });
        },
      });

    // Play audio while recording is active, with specific encoding format
    const turnId = "response-turn-1";
    await ExpoPlayAudioStream.playSound(
      someAudioBase64,
      turnId,
      EncodingTypes.PCM_F32LE
    );

    // Play a complete WAV file directly
    await ExpoPlayAudioStream.playWav(wavBase64Data);

    // Example of controlling playback during recording
    setTimeout(async () => {
      // Clear the queue for a specific turn
      await ExpoPlayAudioStream.clearSoundQueueByTurnId(turnId);

      // Interrupt current playback
      await ExpoPlayAudioStream.interruptSound();

      // Resume playback
      await ExpoPlayAudioStream.resumeSound();

      // Stop microphone recording
      await ExpoPlayAudioStream.stopMicrophone();

      // Clean up
      subscription?.remove();
    }, 5000);
  } catch (error) {
    console.error("Simultaneous audio handling error:", error);
  }
}
```

## API 📚

The Expo Play Audio Stream module provides the following methods:

### Standard Audio Operations

- `destroy()`: Destroys the audio stream module, cleaning up all resources. This should be called when the module is no longer needed. It will reset all internal state and release audio resources.

- `startRecording(recordingConfig: RecordingConfig)`: Starts microphone recording with the specified configuration. Returns a promise with recording result and audio event subscription. Throws an error if the recording fails to start.

- `stopRecording()`: Stops the current microphone recording. Returns a promise that resolves to the audio recording data. Throws an error if the recording fails to stop.

- `playAudio(audioData: AudioDataType, turnId: string, encoding?: Encoding)`: Plays audio data with the specified turn ID. Supports base64 string, Uint8Array, or ArrayBuffer for maximum performance. The optional encoding parameter allows specifying the format of the audio data ('pcm_f32le' or 'pcm_s16le', defaults to 'pcm_s16le'). Throws an error if the audio chunk fails to stream.

- `pauseAudio()`: Pauses the current audio playback. Throws an error if the audio playback fails to pause.

- `stopAudio()`: Stops the currently playing audio. Throws an error if the audio fails to stop.

- `clearPlaybackQueueByTurnId(turnId: string)`: Clears the playback queue for a specific turn ID. Throws an error if the playback queue fails to clear.

- `setSoundConfig(config: SoundConfig)`: Sets the sound player configuration with options for sample rate and playback mode. The SoundConfig interface accepts:

  - `sampleRate`: The sample rate for audio playback in Hz (16000, 24000, 44100, or 48000)
  - `playbackMode`: The playback mode ('regular', 'voiceProcessing', or 'conversation')
  - `useDefault`: When true, resets to default configuration regardless of other parameters

  **Playback Modes:**

  - `REGULAR`: Standard audio playback (default)
  - `VOICE_PROCESSING`: Optimized for voice with hardware echo cancellation (AEC)
  - `CONVERSATION`: Full-duplex voice communication with AEC (recommended for conversational AI)

  Default settings are:

  - Android: sampleRate: 44100, playbackMode: 'regular'
  - iOS: sampleRate: 44100.0, playbackMode: 'regular'

### Simultaneous Recording and Playback

These methods are specifically designed for scenarios where you need to record and play audio at the same time:

- `startMicrophone(recordingConfig: RecordingConfig)`: Starts microphone streaming with voice processing enabled. Returns a promise that resolves to an object containing the recording result and a subscription to audio events. Throws an error if the recording fails to start.

- `stopMicrophone()`: Stops the current microphone streaming. Returns a promise that resolves to the audio recording data or null. Throws an error if the microphone streaming fails to stop.

- `playSound(audio: AudioDataType, turnId: string, encoding?: Encoding)`: Plays a sound while recording is active. Uses voice processing to prevent feedback. Supports base64 string, Uint8Array, or ArrayBuffer. The optional encoding parameter allows specifying the format of the audio data ('pcm_f32le' or 'pcm_s16le', defaults to 'pcm_s16le'). Throws an error if the sound fails to play.

- `stopSound()`: Stops the currently playing sound in simultaneous mode. Throws an error if the sound fails to stop.

- `interruptSound()`: Interrupts the current sound playback in simultaneous mode. Throws an error if the sound fails to interrupt.

- `resumeSound()`: Resumes the current sound playback in simultaneous mode. Throws an error if the sound fails to resume.

- `clearSoundQueueByTurnId(turnId: string)`: Clears the sound queue for a specific turn ID in simultaneous mode. Throws an error if the sound queue fails to clear.

- `playWav(wavBase64: string)`: Plays a WAV format audio file from base64 encoded data. Unlike playSound(), this method plays the audio directly without queueing. The audio data should be base64 encoded WAV format. Throws an error if the WAV audio fails to play.

- `toggleSilence()`: Toggles the silence state of the microphone during recording. This can be useful for temporarily muting the microphone without stopping the recording session. Throws an error if the microphone fails to toggle silence.

- `promptMicrophoneModes()`: Prompts the user to select the microphone mode (iOS specific feature).

### Buffered Audio Streaming

These methods enable jitter-buffered playback with health monitoring and adaptive behavior:

- `startBufferedAudioStream(config: BufferedStreamConfig)`: Starts a buffered audio stream for the given turn ID. Initializes an internal buffer manager, optionally sets encoding, begins playback, and (optionally) starts periodic health reporting via `onBufferHealth`.

- `playAudioBuffered(base64Chunk: string, turnId: string, isFirst?: boolean, isFinal?: boolean)`: Enqueues a base64-encoded audio chunk for buffered playback for the specified turn. Use `isFirst`/`isFinal` to mark boundaries.

- `stopBufferedAudioStream(turnId: string)`: Stops buffered playback for the given turn ID, destroys internal resources, and clears the native queue for that turn.

- `getBufferHealthMetrics(turnId: string): IBufferHealthMetrics | null`: Returns the current buffer health metrics for a turn if available, otherwise `null`.

- `isBufferedAudioStreamPlaying(turnId: string): boolean`: Returns whether the buffered stream for the given turn ID is actively playing.

- `updateBufferedAudioConfig(turnId: string, config: Partial<IAudioBufferConfig>)`: Updates buffer configuration on the fly and applies adaptive adjustments.

### Event Subscriptions

- `subscribeToAudioEvents(onMicrophoneStream: (event: AudioDataEvent) => Promise<void>)`: Subscribes to audio events emitted during recording/streaming. The callback receives an AudioDataEvent containing:

  - `data`: Base64 encoded audio data at original sample rate
  - `position`: Current position in the audio stream
  - `fileUri`: URI of the recording file
  - `eventDataSize`: Size of the current audio data chunk
  - `totalSize`: Total size of recorded audio so far
  - `soundLevel`: Optional sound level measurement that can be used for visualization
    Returns a subscription that should be cleaned up when no longer needed.

- `subscribeToSoundChunkPlayed(onSoundChunkPlayed: (event: SoundChunkPlayedEventPayload) => Promise<void>)`: Subscribes to events emitted when a sound chunk has finished playing. The callback receives a payload indicating if this was the final chunk. Returns a subscription that should be cleaned up when no longer needed.

- `subscribe<T>(eventName: string, onEvent: (event: T | undefined) => Promise<void>)`: Generic subscription method for any event emitted by the module. Available events include:
  - `AudioData`: Emitted when new audio data is available during recording
  - `SoundChunkPlayed`: Emitted when a sound chunk finishes playing
  - `SoundStarted`: Emitted when sound playback begins

Note: When playing audio, you can use the special turnId `"supspend-sound-events"` to suppress sound events for that particular playback. This is useful when you want to play audio without triggering the sound events.

### Types

**Core Audio Types:**

- `Encoding`: Defines the audio encoding format, either 'pcm_f32le' (32-bit float) or 'pcm_s16le' (16-bit signed integer)
- `EncodingTypes`: Constants for audio encoding formats (EncodingTypes.PCM_F32LE, EncodingTypes.PCM_S16LE)
- `PlaybackMode`: Defines different playback modes ('regular', 'voiceProcessing', or 'conversation')
- `PlaybackModes`: Constants for playback modes (PlaybackModes.REGULAR, PlaybackModes.VOICE_PROCESSING, PlaybackModes.CONVERSATION)
- `SampleRate`: Supported sample rates (16000, 24000, 44100, or 48000 Hz)
- `RecordingEncodingType`: Encoding type for recording ('pcm_32bit', 'pcm_16bit', or 'pcm_8bit')
- `AudioDataType`: Union type for audio data: `string | Uint8Array | ArrayBuffer` (supports both base64 and binary formats)

**Event Types:**

- `AudioEvents`: Enumeration of event names emitted by the module.
- `DeviceReconnectedReason`: Enumeration of reasons for device reconnection events.
- `DeviceReconnectedEventPayload`: Payload type for device reconnection events.
- `SuspendSoundEventTurnId`: Constant turn ID that suppresses sound events for a specific playback.

**Buffer Management Types:**

- `IAudioBufferConfig`: Configuration for the jitter buffer (sizes, thresholds, timing, sampleRate).
- `IAudioPlayPayload`: Structured payload used when enqueuing buffered audio frames.
- `IAudioFrame`: Individual audio frame representation used by buffering internals.
- `BufferHealthState`: Health state classification for the jitter buffer.
- `IBufferHealthMetrics`: Health metrics snapshot of the buffer (levels, underruns, etc.).
- `IAudioBufferManager`: Interface for buffer manager implementations.
- `BufferedStreamConfig`: Configuration for starting buffered audio streams.
- `SmartBufferConfig`: Configuration for adaptive buffer behavior.
- `SmartBufferMode`: Modes for adaptive buffering strategies ('conservative', 'balanced', 'aggressive', 'adaptive').
- `NetworkConditions`: Network conditions used to guide adaptive buffering (latency, jitter, packetLoss).

Advanced exports (for low-level/advanced usage):

- `AudioBufferManager`, `SmartBufferManager`: Buffer manager implementations.
- `FrameProcessor`, `QualityMonitor`: Processing and quality monitoring utilities.
- `RingBuffer`: Memory-optimized circular buffer for custom audio processing.

All methods are static and most return Promises that resolve when the operation is complete. Error handling is built into each method, with descriptive error messages if operations fail.

## Swift Implementation 🍎

The Swift implementation of the Expo Audio Stream module uses the `AVFoundation` framework to handle audio playback. It utilizes a dual-buffer queue system to ensure smooth and uninterrupted audio streaming. The module also configures the audio session and manages the audio engine and player node.

## Kotlin Implementation 🤖

The Kotlin implementation of the Expo Audio Stream module uses the `AudioTrack` class from the Android framework to handle audio playback. It uses a concurrent queue to manage the audio chunks and a coroutine-based playback loop to ensure efficient and asynchronous processing of the audio data.

## Production Features 🚀

### 🎙️ Hardware Echo Cancellation (AEC)

The module automatically enables hardware echo cancellation when using voice processing modes:

- **Android**: Uses `USAGE_VOICE_COMMUNICATION` with `CONTENT_TYPE_SPEECH` for hardware AEC
- **iOS**: Uses `.voiceChat` mode with voice processing for full AEC support
- **Automatic**: Enabled when `playbackMode` is set to `VOICE_PROCESSING` or `CONVERSATION`

### 🔄 Audio Focus Management

Automatic audio session management for seamless multi-app audio:

- **Android**: `AudioFocusRequest` with transient loss handling and automatic resumption
- **iOS**: `AVAudioSession.interruptionNotification` with intelligent pause/resume
- **Automatic**: Handles phone calls, notifications, and other app audio interruptions

### 🧠 Memory-Optimized Ring Buffer

The buffer manager uses a high-performance circular buffer:

- **O(1)** enqueue/dequeue operations
- **Zero array resizing** - pre-allocated fixed capacity
- **Automatic overrun handling** - drops oldest frames when full
- **Reduced GC pressure** - minimizes memory allocation/deallocation

### ⚡ JSI Binary Data Support

Direct binary data transfer for maximum performance:

- **Uint8Array**: Zero-copy audio data transfer
- **ArrayBuffer**: Direct memory buffer support
- **Base64 fallback**: Automatic conversion for compatibility
- **Performance boost**: Up to 50% faster for large audio files

### 📊 Adaptive Buffering

Intelligent buffer management based on network conditions:

- **Smart modes**: `conservative`, `balanced`, `aggressive`, `adaptive`
- **Network awareness**: Adjusts based on latency, jitter, packet loss
- **Health monitoring**: Real-time buffer metrics and underrun detection
- **Automatic adjustment**: Self-tuning buffer sizes for optimal performance

## Voice Processing and Isolation 🎤

The module implements several audio optimizations for voice recording:

- On iOS 15 and later, users are prompted with system voice isolation options (`microphoneModes`), allowing them to choose their preferred voice isolation level.
- When simultaneous recording and playback is enabled, the module uses hardware voice processing which includes:
  - Noise reduction
  - Echo cancellation
  - Voice optimization

**Voice Processing Modes:**

- `VOICE_PROCESSING`: Enables AEC for voice calls and processing
- `CONVERSATION`: Full-duplex communication with AEC (recommended for AI assistants)

Note: Voice processing may result in lower audio levels as it optimizes for voice clarity over volume. This is a trade-off made to ensure better voice quality and reduce background noise.

## Limitations and Considerations ⚠️

- **Supported Formats**: The module works with PCM audio data (16-bit/32-bit float, mono). Base64 strings, Uint8Array, and ArrayBuffer are all supported for input.
- **Sample Rates**: 16kHz, 24kHz, 44.1kHz, and 48kHz are supported across all platforms
- **Platform Differences**: Android and iOS have slightly different audio session behaviors, but the module abstracts these differences
- **Memory Usage**: The ring buffer implementation optimizes memory usage, but very large buffer configurations may impact performance on low-end devices
- **Echo Cancellation**: Hardware AEC is only available on devices that support it (most modern smartphones)
- **Audio Focus**: Automatic focus management works best with well-behaved apps; some system audio cannot be interrupted
- **Advanced Features**: The module focuses on streaming and buffering rather than audio effects, mixing, or advanced DSP

## Performance Optimizations 🎯

The module includes several performance optimizations for production use:

- **Binary Data Transfer**: Direct memory buffers bypass base64 encoding/decoding
- **Ring Buffer**: O(1) operations with zero garbage collection pressure
- **Adaptive Buffering**: Self-tuning based on network conditions
- **Hardware Acceleration**: Uses platform-specific audio optimizations when available
- **Memory Pooling**: Pre-allocated buffers reduce allocation overhead

For best performance in production:

1. Use binary data formats (Uint8Array/ArrayBuffer) instead of base64
2. Configure appropriate buffer sizes for your network conditions
3. Use `VOICE_PROCESSING` or `CONVERSATION` modes for voice applications
4. Monitor buffer health metrics for optimization

## Contributions 🤝

Contributions to the Expo Audio Stream module are welcome! If you encounter any issues or have ideas for improvements, feel free to open an issue or submit a pull request on the [GitHub repository](https://github.com/SaltMango/expo-audio-stream).

## Credits 🙏

This package is based on the original work by [mykin-ai/expo-audio-stream](https://github.com/mykin-ai/expo-audio-stream). This fork adds production-ready features including adaptive buffering, hardware echo cancellation, and performance optimizations.

Special thanks to the original author and all contributors! 🙏

## License 📄

The Expo Play Audio Stream module is licensed under the [MIT License](LICENSE).
