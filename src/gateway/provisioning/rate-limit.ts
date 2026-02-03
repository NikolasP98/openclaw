/**
 * Rate Limiting for Provisioning API
 */

type RateLimitEntry = {
	count: number;
	resetAt: number;
};

/**
 * In-memory rate limiter for provisioning keys
 */
export class ProvisioningRateLimiter {
	private limits = new Map<string, RateLimitEntry>();
	private readonly maxRequestsPerWindow: number;
	private readonly windowMs: number;

	constructor(maxRequestsPerMinute = 10) {
		this.maxRequestsPerWindow = maxRequestsPerMinute;
		this.windowMs = 60 * 1000; // 1 minute

		// Clean up old entries every 5 minutes
		setInterval(() => this.cleanup(), 5 * 60 * 1000);
	}

	/**
	 * Check if a key is rate limited
	 * @returns true if allowed, false if rate limited
	 */
	check(keyId: string): boolean {
		const now = Date.now();
		const entry = this.limits.get(keyId);

		if (!entry || now > entry.resetAt) {
			// No entry or window expired - allow and start new window
			this.limits.set(keyId, {
				count: 1,
				resetAt: now + this.windowMs,
			});
			return true;
		}

		// Within window - check limit
		if (entry.count >= this.maxRequestsPerWindow) {
			return false;
		}

		// Increment counter
		entry.count++;
		return true;
	}

	/**
	 * Get remaining requests for a key
	 */
	getRemaining(keyId: string): number {
		const now = Date.now();
		const entry = this.limits.get(keyId);

		if (!entry || now > entry.resetAt) {
			return this.maxRequestsPerWindow;
		}

		return Math.max(0, this.maxRequestsPerWindow - entry.count);
	}

	/**
	 * Get reset time for a key
	 */
	getResetAt(keyId: string): number | undefined {
		const entry = this.limits.get(keyId);
		return entry?.resetAt;
	}

	/**
	 * Clean up expired entries
	 */
	private cleanup(): void {
		const now = Date.now();
		for (const [keyId, entry] of this.limits.entries()) {
			if (now > entry.resetAt) {
				this.limits.delete(keyId);
			}
		}
	}
}
