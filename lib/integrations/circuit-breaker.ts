/**
 * Circuit Breaker Pattern
 * Phase 7.1.1: Implement circuit breaker for external API calls
 *
 * Prevents cascading failures by temporarily stopping calls to failing services.
 */

// ============================================================================
// TYPES
// ============================================================================

export type CircuitState = "closed" | "open" | "half-open"

interface CircuitBreakerOptions {
  /** Name for logging/monitoring */
  name: string
  /** Number of failures before opening circuit */
  failureThreshold: number
  /** Time in ms before attempting to close circuit */
  resetTimeout: number
  /** Number of successful calls in half-open to close circuit */
  successThreshold: number
  /** Optional timeout for calls in ms */
  callTimeout?: number
}

interface CircuitBreakerState {
  state: CircuitState
  failures: number
  successes: number
  lastFailure: number | null
  lastSuccess: number | null
  nextAttempt: number | null
}

interface CircuitBreakerStats {
  name: string
  state: CircuitState
  failures: number
  successes: number
  lastFailure: Date | null
  lastSuccess: Date | null
  isOpen: boolean
}

// ============================================================================
// CIRCUIT BREAKER CLASS
// ============================================================================

export class CircuitBreaker {
  private options: CircuitBreakerOptions
  private state: CircuitBreakerState

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      ...options,
      // Ensure required fields have values (options already has name)
      failureThreshold: options.failureThreshold ?? 5,
      resetTimeout: options.resetTimeout ?? 60000, // 1 minute
      successThreshold: options.successThreshold ?? 2,
    }

    this.state = {
      state: "closed",
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      nextAttempt: null,
    }
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state.state === "open") {
      if (Date.now() < (this.state.nextAttempt ?? 0)) {
        throw new CircuitOpenError(
          `Circuit breaker '${this.options.name}' is open`,
          this.state.nextAttempt ?? 0
        )
      }
      // Transition to half-open to test
      this.state.state = "half-open"
      this.state.successes = 0
    }

    try {
      // Execute with optional timeout
      const result = this.options.callTimeout
        ? await this.withTimeout(fn, this.options.callTimeout)
        : await fn()

      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  /**
   * Record a successful call
   */
  private onSuccess(): void {
    this.state.lastSuccess = Date.now()
    this.state.failures = 0

    if (this.state.state === "half-open") {
      this.state.successes++
      if (this.state.successes >= this.options.successThreshold) {
        this.close()
      }
    }
  }

  /**
   * Record a failed call
   */
  private onFailure(): void {
    this.state.lastFailure = Date.now()
    this.state.failures++
    this.state.successes = 0

    if (
      this.state.state === "half-open" ||
      this.state.failures >= this.options.failureThreshold
    ) {
      this.open()
    }
  }

  /**
   * Open the circuit
   */
  private open(): void {
    this.state.state = "open"
    this.state.nextAttempt = Date.now() + this.options.resetTimeout
    console.warn(
      `[CircuitBreaker] '${this.options.name}' opened after ${this.state.failures} failures. ` +
        `Will retry at ${new Date(this.state.nextAttempt).toISOString()}`
    )
  }

  /**
   * Close the circuit
   */
  private close(): void {
    this.state.state = "closed"
    this.state.failures = 0
    this.state.nextAttempt = null
    console.info(`[CircuitBreaker] '${this.options.name}' closed after successful recovery`)
  }

  /**
   * Force reset the circuit breaker
   */
  reset(): void {
    this.state = {
      state: "closed",
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      nextAttempt: null,
    }
  }

  /**
   * Get current stats
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.options.name,
      state: this.state.state,
      failures: this.state.failures,
      successes: this.state.successes,
      lastFailure: this.state.lastFailure ? new Date(this.state.lastFailure) : null,
      lastSuccess: this.state.lastSuccess ? new Date(this.state.lastSuccess) : null,
      isOpen: this.state.state === "open",
    }
  }

  /**
   * Wrap a function with timeout
   */
  private async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new TimeoutError(`Call timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ])
  }
}

// ============================================================================
// CUSTOM ERRORS
// ============================================================================

export class CircuitOpenError extends Error {
  constructor(
    message: string,
    public nextAttempt: number
  ) {
    super(message)
    this.name = "CircuitOpenError"
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TimeoutError"
  }
}

// ============================================================================
// PRE-CONFIGURED CIRCUIT BREAKERS
// ============================================================================

// Store circuit breakers for reuse
const circuitBreakers = new Map<string, CircuitBreaker>()

/**
 * Get or create a circuit breaker for a service
 */
export function getCircuitBreaker(
  name: string,
  options?: Partial<Omit<CircuitBreakerOptions, "name">>
): CircuitBreaker {
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(
      name,
      new CircuitBreaker({
        name,
        failureThreshold: options?.failureThreshold ?? 5,
        resetTimeout: options?.resetTimeout ?? 60000,
        successThreshold: options?.successThreshold ?? 2,
        callTimeout: options?.callTimeout,
      })
    )
  }
  return circuitBreakers.get(name)!
}

/**
 * Pre-configured circuit breakers for voice providers
 */
export const voiceProviderCircuitBreakers = {
  vapi: getCircuitBreaker("vapi", {
    failureThreshold: 3,
    resetTimeout: 30000,
    callTimeout: 10000,
  }),
  retell: getCircuitBreaker("retell", {
    failureThreshold: 3,
    resetTimeout: 30000,
    callTimeout: 10000,
  }),
}

/**
 * Get all circuit breaker stats
 */
export function getAllCircuitBreakerStats(): CircuitBreakerStats[] {
  return Array.from(circuitBreakers.values()).map((cb) => cb.getStats())
}

