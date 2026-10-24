import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiApiClient } from "../client";
import {
  synthesizeGr1,
  type Gr1SynthesizeRequest,
  type SynthesizeResponse,
} from "../endpoints";

// mununu 0.5: GR(1) synthesis is `controller_mode: "gr1"` on `/context/synth`,
// answered in the synthesis response shape.
const mockResponse: SynthesizeResponse = {
  success: true,
  outcome: "holds",
  realizable: true,
  controller: null,
  controller_native: {
    name: "gr1_controller.sv",
    content:
      "module gr1_controller (input logic clk, input logic req, output logic grant);\nendmodule",
  },
  diagnostics: {
    messages: ["GR(1) game: 13 states, 2 monitor bits"],
    violating_initials: [],
    counterstrategy_traces: [],
    deadlock_traces: [],
    proof_obligations: [],
  },
};

describe("synthesizeGr1 (POST /context/synth, controller_mode gr1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the spec with controller_mode gr1 and returns the verdict + controller SV", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: mockResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const req: Gr1SynthesizeRequest = {
      context: {
        name: "rg.tlsf",
        content:
          "MAIN { INPUTS { req; } OUTPUTS { grant; } " +
          "ASSUMPTIONS { G F req; } GUARANTEES { G (req -> F grant); } }",
      },
    };
    const out = await synthesizeGr1(req);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = postSpy.mock.calls[0];
    expect(endpoint).toBe("/context/synth");
    expect(payload).toMatchObject({
      context: req.context,
      options: { controller_mode: "gr1" },
    });
    // No automaton: the GR(1) mode reads the LTL spec itself.
    expect(payload).not.toHaveProperty("automaton");
    expect(out.outcome).toBe("holds");
    expect(out.realizable).toBe(true);
    expect(out.controller_native?.content).toContain("module gr1_controller");
    expect(out.diagnostics.messages).toContain(
      "GR(1) game: 13 states, 2 monitor bits",
    );
  });

  it("surfaces an unrealizable verdict with no controller", async () => {
    vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: {
        ...mockResponse,
        outcome: "violated",
        realizable: false,
        controller_native: undefined,
      } as SynthesizeResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const out = await synthesizeGr1({
      context: {
        name: "u.tlsf",
        content: "MAIN { INPUTS { req; } OUTPUTS { grant; } }",
      },
    });
    expect(out.outcome).toBe("violated");
    expect(out.realizable).toBe(false);
    expect(out.controller_native).toBeUndefined();
  });
});
