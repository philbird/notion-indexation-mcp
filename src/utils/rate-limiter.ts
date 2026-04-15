/**
 * Token-bucket rate limiter for Notion API (3 requests/second).
 * Callers await acquire() before making a request.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly maxTokens: number = 3,
    private readonly refillRateMs: number = 1000,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens > 0) {
      this.tokens--;
      return;
    }
    // Wait until next token is available
    const waitMs = this.refillRateMs - (Date.now() - this.lastRefill);
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitMs)));
    this.refill();
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillRateMs) {
      const periods = Math.floor(elapsed / this.refillRateMs);
      this.tokens = Math.min(this.maxTokens, this.tokens + periods * this.maxTokens);
      this.lastRefill += periods * this.refillRateMs;
    }
  }
}
