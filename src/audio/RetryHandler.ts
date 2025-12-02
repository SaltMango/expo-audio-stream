import { IRetryConfig, DEFAULT_RETRY_CONFIG } from '../types';

/**
 * Production-ready retry handler with exponential backoff.
 * Provides resilient error handling for audio operations.
 */
export class RetryHandler {
  private _config: IRetryConfig;

  constructor(config?: Partial<IRetryConfig>) {
    this._config = {
      ...DEFAULT_RETRY_CONFIG,
      ...config,
    };
  }

  /**
   * Executes an operation with retry logic
   * @param operation - The async operation to execute
   * @param operationName - Name for logging purposes
   * @returns The result of the operation
   * @throws Error if all retries fail
   */
  public async execute<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= this._config.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < this._config.maxRetries) {
          const delay = this._calculateDelay(attempt);
          console.warn(
            `[RetryHandler] ${operationName} failed (attempt ${attempt + 1}/${this._config.maxRetries + 1}), ` +
            `retrying in ${delay}ms: ${lastError.message}`
          );
          await this._sleep(delay);
        }
      }
    }

    console.error(
      `[RetryHandler] ${operationName} failed after ${this._config.maxRetries + 1} attempts`
    );
    throw lastError;
  }

  /**
   * Executes an operation with retry logic, returning null on failure instead of throwing
   * @param operation - The async operation to execute
   * @param operationName - Name for logging purposes
   * @returns The result of the operation, or null if all retries fail
   */
  public async executeSafe<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T | null> {
    try {
      return await this.execute(operation, operationName);
    } catch {
      return null;
    }
  }

  /**
   * Calculates delay for the given attempt using exponential backoff
   */
  private _calculateDelay(attempt: number): number {
    let delay = this._config.initialDelayMs * 
      Math.pow(this._config.backoffMultiplier, attempt);
    
    // Cap at max delay
    delay = Math.min(delay, this._config.maxDelayMs);
    
    // Add jitter if configured (±25% randomization)
    if (this._config.useJitter) {
      const jitterFactor = 0.75 + Math.random() * 0.5; // 0.75 to 1.25
      delay = Math.round(delay * jitterFactor);
    }
    
    return delay;
  }

  /**
   * Sleep for the specified duration
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Updates retry configuration
   */
  public updateConfig(config: Partial<IRetryConfig>): void {
    this._config = {
      ...this._config,
      ...config,
    };
  }

  /**
   * Gets current configuration
   */
  public getConfig(): IRetryConfig {
    return { ...this._config };
  }
}

/**
 * Global retry handler instance with default configuration
 */
export const defaultRetryHandler = new RetryHandler();

