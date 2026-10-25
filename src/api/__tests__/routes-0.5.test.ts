import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiClient, aiApiClient } from "../client";
import {
  getContextGraphs,
  runBtor2Verify,
  runBtor2VerifyLiveness,
  runSvVerifyBad,
  runSvVerifyLiveness,
  verifyContext,
  verifyMemoryCheck,
} from "../endpoints";

/**
 * mununu 0.5 renamed the HTTP routes to the CLI verbs with no aliases (the old
 * paths are 404s) and merged the liveness variants into one route. These pin
 * the path each client function posts to, and the merged request forms.
 */
const ok = (data: unknown) => ({
  data,
  status: 200,
  statusText: "OK",
  headers: {},
  config: {} as unknown,
});

describe("client routes (mununu 0.5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("evaluates formulas on /context/eval and reads the outcome", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue(ok({ success: true, outcome: "holds", results: [] }));
    const out = await verifyContext({
      context: { name: "m.ctxdsl", content: "context m {}" },
    });
    expect(post.mock.calls[0][0]).toBe("/context/eval");
    expect(out.outcome).toBe("holds");
  });

  it("fetches graphs from /context/graph", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue(ok({ success: true, graphs: [] }));
    await getContextGraphs({
      context: { name: "m.ctxdsl", content: "context m {}" },
    } as Parameters<typeof getContextGraphs>[0]);
    expect(post.mock.calls[0][0]).toBe("/context/graph");
  });

  it("runs the memory check on /memory/check", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue(
        ok({ postures: [], undeclared_sources: [], warnings: [], info: [] }),
      );
    await verifyMemoryCheck({ config_toml: "[project]\nname = 'x'\n" });
    expect(post.mock.calls[0][0]).toBe("/memory/check");
  });

  it("posts the SV safety verb to /sv/verify-bad with a lift object", async () => {
    const post = vi.spyOn(aiApiClient, "post").mockResolvedValue(
      ok({
        outcome: "holds",
        reachable_by: [],
        unreachable_by: ["exact"],
        contradiction: false,
      }),
    );
    const out = await runSvVerifyBad({
      lift: { source: "module m; endmodule", top: "m", frontend: "auto" },
    });
    expect(post.mock.calls[0][0]).toBe("/sv/verify-bad");
    expect(post.mock.calls[0][1]).toEqual({
      lift: { source: "module m; endmodule", top: "m", frontend: "auto" },
    });
    expect(out.outcome).toBe("holds");
  });

  it("asks btor2 verify for a witness and reads the finite trace", async () => {
    const post = vi.spyOn(aiApiClient, "post").mockResolvedValue(
      ok({
        outcome: "violated",
        reachable_by: ["native-bmc"],
        unreachable_by: [],
        contradiction: false,
        trace: {
          kind: "finite",
          steps: [
            {
              cycle: 0,
              state: [{ register: "st", value: 0, hex: "0x0", bits: 1 }],
            },
          ],
        },
      }),
    );
    const out = await runBtor2Verify({ content: "…", witness: true });
    expect(post.mock.calls[0][1]).toEqual({ content: "…", witness: true });
    expect(out.trace?.kind).toBe("finite");
  });

  it("sends a liveness conjunction and a justice run to the one /btor2/verify-liveness route", async () => {
    const post = vi.spyOn(aiApiClient, "post").mockResolvedValue(
      ok({
        outcome: "holds",
        property: "",
        decided_by: [],
        justice: [
          {
            index: 0,
            size: 1,
            outcome: "holds",
            decided_by: ["exact"],
            notes: [],
          },
        ],
        converted_from_aiger: true,
      }),
    );
    await runBtor2VerifyLiveness({
      content: "…",
      responses: ["req == 1 => ack == 1"],
    });
    const out = await runBtor2VerifyLiveness({
      content: "aag 1 1 0 0 0",
      justice: true,
      rung: "both",
      timeout_ms: 5000,
    });
    expect(post.mock.calls.map((c) => c[0])).toEqual([
      "/btor2/verify-liveness",
      "/btor2/verify-liveness",
    ]);
    expect(post.mock.calls[1][1]).toMatchObject({
      justice: true,
      timeout_ms: 5000,
    });
    expect(out.justice?.[0].outcome).toBe("holds");
    expect(out.converted_from_aiger).toBe(true);
  });

  it("sends SV liveness under fairness to /sv/verify-liveness", async () => {
    const post = vi
      .spyOn(aiApiClient, "post")
      .mockResolvedValue(
        ok({ outcome: "holds", property: "", decided_by: [] }),
      );
    await runSvVerifyLiveness({
      lift: { source: "module m; endmodule" },
      request: "req == 1",
      grant: "ack == 1",
      fairness: ["ready == 1"],
    });
    expect(post.mock.calls[0][0]).toBe("/sv/verify-liveness");
  });
});
