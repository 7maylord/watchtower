import { type Runtime } from "@chainlink/cre-sdk";

/**
 * Production-grade HTTP client with retry logic and error handling
 */
export class ResilientHTTPClient {
  private maxRetries: number;
  private baseDelay: number;

  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  /**
   * Exponential backoff delay calculation
   */
  private getDelay(attempt: number): number {
    return this.baseDelay * Math.pow(2, attempt);
  }

  /**
   * Make HTTP request with retry logic
   */
  async request<T>(
    url: string,
    options: RequestInit,
    runtime?: Runtime<any>,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (runtime && attempt > 0) {
          runtime.log(
            `🔄 Retry attempt ${attempt + 1}/${this.maxRetries} for ${url}`,
          );
        }

        const response = await fetch(url, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...options.headers,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data as T;
      } catch (error) {
        lastError = error as Error;

        if (runtime) {
          runtime.log(`⚠️ Request failed: ${lastError.message}`);
        }

        // Don't retry on 4xx errors (client errors)
        if (lastError.message.includes("HTTP 4")) {
          throw lastError;
        }

        // Wait before retrying (except on last attempt)
        if (attempt < this.maxRetries - 1) {
          const delay = this.getDelay(attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Request failed after ${this.maxRetries} attempts: ${lastError?.message || "Unknown error"}`,
    );
  }

  /**
   * GET request
   */
  async get<T>(
    url: string,
    headers: Record<string, string> = {},
    runtime?: Runtime<any>,
  ): Promise<T> {
    return this.request<T>(url, { method: "GET", headers }, runtime);
  }

  /**
   * POST request
   */
  async post<T>(
    url: string,
    body: any,
    headers: Record<string, string> = {},
    runtime?: Runtime<any>,
  ): Promise<T> {
    return this.request<T>(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      },
      runtime,
    );
  }
}

/**
 * Structured logging utility
 */
export class StructuredLogger {
  constructor(private runtime: Runtime<any>) {}

  info(message: string, context?: Record<string, any>) {
    const log = context ? `${message} | ${JSON.stringify(context)}` : message;
    this.runtime.log(`ℹ️  ${log}`);
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    const errorMsg = error ? `${message}: ${error.message}` : message;
    const log = context ? `${errorMsg} | ${JSON.stringify(context)}` : errorMsg;
    this.runtime.log(`❌ ${log}`);
  }

  warn(message: string, context?: Record<string, any>) {
    const log = context ? `${message} | ${JSON.stringify(context)}` : message;
    this.runtime.log(`⚠️  ${log}`);
  }

  success(message: string, context?: Record<string, any>) {
    const log = context ? `${message} | ${JSON.stringify(context)}` : message;
    this.runtime.log(`✅ ${log}`);
  }
}

/**
 * Safe JSON stringify for objects with bigints
 */
export function safeJsonStringify(obj: any): string {
  return JSON.stringify(
    obj,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
}

/**
 * Error handling wrapper with context
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context: { operation: string; runtime: Runtime<any> },
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const logger = new StructuredLogger(context.runtime);
    logger.error(`Failed: ${context.operation}`, error as Error);
    throw error;
  }
}

/**
 * Rate limiter using token bucket algorithm
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number,
    private refillRate: number, // tokens per second
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refillTokens() {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refillTokens();

    if (this.tokens < 1) {
      const waitTime = ((1 - this.tokens) / this.refillRate) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.refillTokens();
    }

    this.tokens -= 1;
  }
}

/**
 * API response cache with TTL
 */
export class SimpleCache<T> {
  private cache: Map<string, { data: T; expiry: number }> = new Map();

  set(key: string, data: T, ttlSeconds: number) {
    const expiry = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, { data, expiry });
  }

  get(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  clear() {
    this.cache.clear();
  }
}
