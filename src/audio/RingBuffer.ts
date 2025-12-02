import { IAudioFrame } from "../types";

/**
 * Memory-efficient circular buffer implementation for audio frames.
 * Pre-allocates a fixed-size array and reuses slots to minimize GC pressure.
 *
 * Benefits over standard array:
 * - O(1) enqueue/dequeue operations
 * - No array resizing or memory reallocation
 * - Reduced garbage collection pauses
 * - Predictable memory footprint
 */
export class RingBuffer {
  private _buffer: (IAudioFrame | null)[];
  private _capacity: number;
  private _head: number = 0; // Points to the next write position
  private _tail: number = 0; // Points to the next read position
  private _size: number = 0;

  /**
   * Creates a new ring buffer with the specified capacity
   * @param capacity Maximum number of frames to hold (default: 100 frames ≈ 2 seconds at 20ms/frame)
   */
  constructor(capacity: number = 100) {
    this._capacity = capacity;
    this._buffer = new Array(capacity).fill(null);
  }

  /**
   * Adds a frame to the buffer. If buffer is full, overwrites the oldest frame.
   * @param frame The audio frame to add
   * @returns true if successful, false if frame was dropped due to overrun
   */
  public push(frame: IAudioFrame): boolean {
    if (this._size >= this._capacity) {
      // Buffer is full - overwrite oldest (overrun scenario)
      // Move tail forward to discard oldest frame
      this._tail = (this._tail + 1) % this._capacity;
      this._size--;
    }

    this._buffer[this._head] = frame;
    this._head = (this._head + 1) % this._capacity;
    this._size++;
    return true;
  }

  /**
   * Removes and returns the oldest frame from the buffer
   * @returns The oldest frame, or null if buffer is empty
   */
  public shift(): IAudioFrame | null {
    if (this._size === 0) {
      return null;
    }

    const frame = this._buffer[this._tail];
    this._buffer[this._tail] = null; // Clear reference for GC
    this._tail = (this._tail + 1) % this._capacity;
    this._size--;
    return frame;
  }

  /**
   * Peeks at the oldest frame without removing it
   * @returns The oldest frame, or null if buffer is empty
   */
  public peek(): IAudioFrame | null {
    if (this._size === 0) {
      return null;
    }
    return this._buffer[this._tail];
  }

  /**
   * Adds a frame at the front of the buffer (for silence insertion)
   * @param frame The frame to add at the front
   */
  public unshift(frame: IAudioFrame): void {
    if (this._size >= this._capacity) {
      // Buffer is full - drop the newest frame to make room
      this._head = (this._head - 1 + this._capacity) % this._capacity;
      this._buffer[this._head] = null;
      this._size--;
    }

    // Move tail backward
    this._tail = (this._tail - 1 + this._capacity) % this._capacity;
    this._buffer[this._tail] = frame;
    this._size++;
  }

  /**
   * Clears all frames from the buffer
   */
  public clear(): void {
    // Clear all references for GC
    for (let i = 0; i < this._capacity; i++) {
      this._buffer[i] = null;
    }
    this._head = 0;
    this._tail = 0;
    this._size = 0;
  }

  /**
   * Returns the current number of frames in the buffer
   */
  public get length(): number {
    return this._size;
  }

  /**
   * Returns the maximum capacity of the buffer
   */
  public get capacity(): number {
    return this._capacity;
  }

  /**
   * Returns true if the buffer is empty
   */
  public get isEmpty(): boolean {
    return this._size === 0;
  }

  /**
   * Returns true if the buffer is full
   */
  public get isFull(): boolean {
    return this._size >= this._capacity;
  }

  /**
   * Calculates total duration of all frames in the buffer
   * @returns Total duration in milliseconds
   */
  public getTotalDurationMs(): number {
    if (this._size === 0) {
      return 0;
    }

    let totalMs = 0;
    let index = this._tail;
    let count = 0;

    while (count < this._size) {
      const frame = this._buffer[index];
      if (frame) {
        totalMs += frame.duration;
      }
      index = (index + 1) % this._capacity;
      count++;
    }

    return totalMs;
  }

  /**
   * Drops the oldest N frames from the buffer
   * @param count Number of frames to drop
   * @returns Actual number of frames dropped
   */
  public dropOldest(count: number): number {
    const toDrop = Math.min(count, this._size);

    for (let i = 0; i < toDrop; i++) {
      this._buffer[this._tail] = null;
      this._tail = (this._tail + 1) % this._capacity;
    }

    this._size -= toDrop;
    return toDrop;
  }

  /**
   * Returns buffer utilization as a percentage (0-100)
   */
  public getUtilization(): number {
    return (this._size / this._capacity) * 100;
  }

  /**
   * Iterates over all frames in order (oldest to newest) without removing them
   * @param callback Function to call for each frame
   */
  public forEach(callback: (frame: IAudioFrame, index: number) => void): void {
    let index = this._tail;
    let count = 0;

    while (count < this._size) {
      const frame = this._buffer[index];
      if (frame) {
        callback(frame, count);
      }
      index = (index + 1) % this._capacity;
      count++;
    }
  }
}
