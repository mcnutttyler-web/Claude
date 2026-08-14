import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("vision recognition client", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("throws a clear config error when ANTHROPIC_API_KEY is missing", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { identifyCardFromImage, VisionConfigError } = await import("../lib/recognition/vision");
    await expect(identifyCardFromImage(Buffer.from("x"), "image/jpeg")).rejects.toBeInstanceOf(VisionConfigError);
  });

  it("parses a well-formed JSON response from the vision API", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: "Mew ex",
              setNameGuess: "Pokemon 151",
              cardNumberGuess: "232/165",
              printingGuess: "Holofoil",
              confidence: "high",
              notes: null,
            }),
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { identifyCardFromImage } = await import("../lib/recognition/vision");
    const result = await identifyCardFromImage(Buffer.from("x"), "image/jpeg");

    expect(result.name).toBe("Mew ex");
    expect(result.cardNumberGuess).toBe("232/165");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["x-api-key"]).toBe("test-key");
  });

  it("tolerates a markdown-fenced JSON response", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: '```json\n{"name":"Pikachu","setNameGuess":null,"cardNumberGuess":null,"printingGuess":null,"confidence":"low","notes":null}\n```' }],
        }),
      })
    );

    const { identifyCardFromImage } = await import("../lib/recognition/vision");
    const result = await identifyCardFromImage(Buffer.from("x"), "image/jpeg");
    expect(result.name).toBe("Pikachu");
    expect(result.confidence).toBe("low");
  });

  it("throws VisionApiError on a non-ok HTTP response", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "unauthorized" })
    );

    const { identifyCardFromImage, VisionApiError } = await import("../lib/recognition/vision");
    await expect(identifyCardFromImage(Buffer.from("x"), "image/jpeg")).rejects.toBeInstanceOf(VisionApiError);
  });
});
