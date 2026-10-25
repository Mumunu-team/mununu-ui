import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiApiClient } from "../client";
import {
  runBtor2CheckFsm,
  runSvCheckFsm,
  type Btor2CheckFsmRequest,
  type Btor2CheckFsmResponse,
  type SvCheckFsmRequest,
} from "../endpoints";

const mockResponse: Btor2CheckFsmResponse = {
  fsm_registers_checked: 2,
  illegal_encodings_found: 1,
  registers: [
    {
      register: "state_q",
      legal_encodings: [3, 14, 16, 29, 36, 41, 55, 58],
      outcome: "holds",
      illegal_encoding_reachable: false,
    },
    {
      register: "sub_sm",
      legal_encodings: [0, 1, 2],
      outcome: "violated",
      illegal_encoding_reachable: true,
    },
  ],
};

describe("runBtor2CheckFsm (POST /btor2/check-fsm)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the BTOR2 content and returns the typed per-register findings", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: mockResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const req: Btor2CheckFsmRequest = {
      content: "1 sort bitvec 1\n2 state 1 st\n",
      max_width: 8,
    };
    const out = await runBtor2CheckFsm(req);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = postSpy.mock.calls[0];
    expect(endpoint).toBe("/btor2/check-fsm");
    expect((payload as Btor2CheckFsmRequest).max_width).toBe(8);

    expect(out.fsm_registers_checked).toBe(2);
    expect(out.illegal_encodings_found).toBe(1);
    // The finding is the register with a reachable illegal encoding.
    const bug = out.registers.find((r) => r.illegal_encoding_reachable);
    expect(bug?.register).toBe("sub_sm");
    expect(bug?.outcome).toBe("violated");
  });
});

describe("runSvCheckFsm (POST /sv/check-fsm)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("nests the design under `lift` and returns the shared check-fsm response", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: mockResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const req: SvCheckFsmRequest = {
      lift: { source: "module m; endmodule", frontend: "sv2v" },
      max_width: 8,
    };
    const out = await runSvCheckFsm(req);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = postSpy.mock.calls[0];
    expect(endpoint).toBe("/sv/check-fsm");
    // mununu 0.5: the lift inputs travel as one `lift` object; the old
    // top-level keys (source, use_sv2v, …) are refused with a 400.
    expect(payload).toEqual({
      lift: { source: "module m; endmodule", frontend: "sv2v" },
      max_width: 8,
    });
    expect(out.illegal_encodings_found).toBe(1);
  });
});
