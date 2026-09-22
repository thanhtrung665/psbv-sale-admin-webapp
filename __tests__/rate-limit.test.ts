import { checkRateLimit, _resetRateLimitState } from "@/lib/rate-limit";

beforeEach(() => {
  _resetRateLimitState();
});

describe("checkRateLimit", () => {
  it("allows calls up to the limit within the window", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("user1", 3, 1000).allowed).toBe(true);
    }
  });

  it("rejects the call once the limit is reached, with a retryAfterSeconds", () => {
    checkRateLimit("user1", 2, 60_000);
    checkRateLimit("user1", 2, 60_000);
    const result = checkRateLimit("user1", 2, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("tracks separate keys independently", () => {
    checkRateLimit("user1", 1, 60_000);
    expect(checkRateLimit("user1", 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit("user2", 1, 60_000).allowed).toBe(true);
  });

  it("resets the window once it expires", () => {
    expect(checkRateLimit("user1", 1, 10).allowed).toBe(true);
    expect(checkRateLimit("user1", 1, 10).allowed).toBe(false);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(checkRateLimit("user1", 1, 10).allowed).toBe(true);
        resolve();
      }, 20);
    });
  });
});
