import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiApiClient } from "../client";
import {
  runSvLint,
  type SvLintRequest,
  type SvLintResponse,
} from "../endpoints";

const mockResponse: SvLintResponse = {
  signals_flagged: 3,
  registers_flagged: 2,
  findings: [
    {
      signal: "q",
      kind: "register",
      rule: "registered-array-read-moving-address",
      detail:
        "`q` is a registered array read addressed by `a_q`, which can change in the same cycle `q` is consumed",
    },
    { signal: "a_q", kind: "register", rule: "undriven-partial-write" },
    { signal: "o_partsel", kind: "output", rule: "undriven-partial-write" },
  ],
};

describe("runSvLint (POST /sv/lint)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nests the design under `lift` and returns the typed partial-write findings", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: mockResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const req: SvLintRequest = {
      lift: { source: "module m; endmodule", frontend: "slang" },
    };
    const out = await runSvLint(req);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = postSpy.mock.calls[0];
    expect(endpoint).toBe("/sv/lint");
    expect((payload as SvLintRequest).lift.frontend).toBe("slang");
    expect(payload).not.toHaveProperty("source");

    expect(out.signals_flagged).toBe(3);
    expect(out.registers_flagged).toBe(2);
    // The partial-write root finding is the register whose lift is unfaithful.
    const partsel = out.findings.find(
      (f) => f.rule === "undriven-partial-write" && f.kind === "register",
    );
    expect(partsel?.signal).toBe("a_q");
  });

  it("carries the mununu#496 registered-array-read rule and its detail", async () => {
    vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: mockResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const out = await runSvLint({ lift: { source: "module m; endmodule" } });

    const arrayRead = out.findings.find(
      (f) => f.rule === "registered-array-read-moving-address",
    );
    expect(arrayRead?.signal).toBe("q");
    // The detail must name the address register — that is what makes the
    // finding actionable rather than just a location.
    expect(arrayRead?.detail).toContain("a_q");
  });

  it("treats detail as optional so a rule that needs no elaboration typechecks", () => {
    const bare: SvLintResponse = {
      signals_flagged: 1,
      registers_flagged: 1,
      findings: [
        { signal: "a_q", kind: "register", rule: "undriven-partial-write" },
      ],
    };
    expect(bare.findings[0].detail).toBeUndefined();
  });
});
