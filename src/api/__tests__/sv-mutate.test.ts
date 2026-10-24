import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiApiClient } from "../client";
import {
  runSvMutate,
  type SvMutateRequest,
  type SvMutateResponse,
} from "../endpoints";

const flipResponse: SvMutateResponse = {
  mutation: "stick:state_q",
  targets: null,
  properties: [
    {
      name: "recoverable",
      baseline: "holds",
      mutant: "violated",
      flipped: true,
    },
    { name: "unrelated", baseline: "holds", mutant: "holds", flipped: false },
  ],
  flipped: 1,
  unflipped: 1,
};

const listResponse: SvMutateResponse = {
  mutation: null,
  targets: {
    stick: ["state_q", "sub_sm"],
    drop_reset: ["state_q"],
    off_by_one: ["cnt"],
    invert_cond: ["below"],
  },
  properties: [],
  flipped: 0,
  unflipped: 0,
};

describe("runSvMutate (POST /sv/mutate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts a mutation and returns the per-property flips", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: flipResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const req: SvMutateRequest = {
      lift: { source: "module m; endmodule", frontend: "slang" },
      mutation: "stick:state_q",
      pins: ["rst_ni=1"],
    };
    const out = await runSvMutate(req);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = postSpy.mock.calls[0];
    expect(endpoint).toBe("/sv/mutate");
    expect((payload as SvMutateRequest).mutation).toBe("stick:state_q");
    expect((payload as SvMutateRequest).pins).toEqual(["rst_ni=1"]);
    expect((payload as SvMutateRequest).lift.frontend).toBe("slang");

    expect(out.flipped).toBe(1);
    // The property that caught the mutation flipped holds → violated.
    const caught = out.properties.find((p) => p.flipped);
    expect(caught?.name).toBe("recoverable");
    expect(caught?.mutant).toBe("violated");
  });

  it("posts a list request and returns the available targets", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: listResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const req: SvMutateRequest = {
      lift: { source: "module m; endmodule" },
      list: true,
    };
    const out = await runSvMutate(req);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(out.mutation).toBeNull();
    expect(out.targets?.stick).toContain("state_q");
    expect(out.targets?.drop_reset).toEqual(["state_q"]);
  });
});
