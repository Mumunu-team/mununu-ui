import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiApiClient } from "../client";
import { synthesizeContext } from "../endpoints";

/**
 * Tests for the synthesize request payload, focused on the
 * `controller_mode` field added by D1a controller-mode integration.
 *
 * The dropdown in the UI sets `options.controller_mode` to one of:
 * "projection" | "functional" | "permissive" | "signature-memory"
 * | "product-game" | "parity-game". This test verifies that the value
 * is passed through to the underlying API call unchanged.
 */
describe("synthesizeContext — controller_mode passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockResponse = {
    data: {
      success: true,
      outcome: "holds",
      realizable: true,
      controller: { name: "ctrl.ctxdsl", content: "" },
      diagnostics: {
        messages: [],
        deadlock_traces: [],
      },
    },
    status: 200,
    statusText: "OK",
    headers: {},
    config: {} as unknown,
  };

  it.each([
    "projection",
    "functional",
    "permissive",
    "signature-memory",
    "product-game",
    "parity-game",
  ] as const)(
    "passes controller_mode='%s' through to /context/synth",
    async (mode) => {
      const postSpy = vi
        .spyOn(aiApiClient, "post")
        .mockResolvedValue(mockResponse);

      await synthesizeContext({
        context: { name: "test.ctxdsl", content: "context test {}" },
        formula: "safety",
        automaton: "M",
        options: {
          minimize: true,
          controller_mode: mode,
        },
      } as Parameters<typeof synthesizeContext>[0]);

      expect(postSpy).toHaveBeenCalledTimes(1);
      const [endpoint, payload] = postSpy.mock.calls[0];
      expect(endpoint).toBe("/context/synth");
      expect(
        (payload as { options?: { controller_mode?: string } }).options
          ?.controller_mode,
      ).toBe(mode);
    },
  );

  it("omits controller_mode when not specified (backwards compat with extract_strategy)", async () => {
    const postSpy = vi
      .spyOn(aiApiClient, "post")
      .mockResolvedValue(mockResponse);

    await synthesizeContext({
      context: { name: "test.ctxdsl", content: "context test {}" },
      formula: "safety",
      automaton: "M",
      options: { minimize: true },
    } as Parameters<typeof synthesizeContext>[0]);

    const [, payload] = postSpy.mock.calls[0];
    expect(
      (payload as { options?: { controller_mode?: string } }).options
        ?.controller_mode,
    ).toBeUndefined();
  });
});
