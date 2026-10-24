import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiApiClient } from "../client";
import {
  runBtor2Game,
  type Btor2GameRequest,
  type Btor2GameResponse,
} from "../endpoints";

// Realizable game → the controller's Mealy strategy.
const controllerResponse: Btor2GameResponse = {
  outcome: "holds",
  detail: "the controller forces the objective against every environment move",
  realizable: true,
  good: "st == 1",
  objective: "reach",
  controllable: ["c"],
  strategy: {
    kind: "controller_strategy",
    state_register: "st",
    entries: [
      { state_value: 1, rank: 0, moves: [], complete: true },
      {
        state_value: 0,
        rank: 1,
        moves: [{ env_inputs: {}, forced_ctrl: { c: 1 } }],
        complete: true,
      },
    ],
  },
};

// Unrealizable game → the environment's positional counterstrategy.
const environmentResponse: Btor2GameResponse = {
  outcome: "violated",
  detail: "the environment can prevent the objective (no controller wins)",
  realizable: false,
  good: "st == 1",
  objective: "reach",
  controllable: ["c"],
  strategy: {
    kind: "environment_counterstrategy",
    state_register: "st",
    entries: [{ state_value: 0, rank: 0, forced_inputs: { e: 1 } }],
  },
};

describe("runBtor2Game (POST /btor2/game)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the game partition and returns the controller strategy when realizable", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: controllerResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const req: Btor2GameRequest = {
      content: "1 sort bitvec 1\n2 input 1 c\n3 input 1 e\n4 state 1 st\n",
      good: "st == 1",
      controllable: ["c"],
    };
    const out = await runBtor2Game(req);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = postSpy.mock.calls[0];
    expect(endpoint).toBe("/btor2/game");
    expect((payload as Btor2GameRequest).good).toBe("st == 1");
    expect((payload as Btor2GameRequest).controllable).toEqual(["c"]);

    expect(out.realizable).toBe(true);
    // The discriminated union narrows on `kind`.
    if (out.strategy?.kind === "controller_strategy") {
      const at0 = out.strategy.entries.find((e) => e.state_value === 0);
      expect(at0?.moves[0].forced_ctrl.c).toBe(1);
    } else {
      throw new Error("expected a controller strategy");
    }
  });

  it("returns the environment counterstrategy when unrealizable", async () => {
    vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: environmentResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const out = await runBtor2Game({
      content: "1 sort bitvec 1\n2 input 1 c\n3 input 1 e\n4 state 1 st\n",
      good: "st == 1",
      controllable: ["c"],
    });

    expect(out.realizable).toBe(false);
    if (out.strategy?.kind === "environment_counterstrategy") {
      const at0 = out.strategy.entries.find((e) => e.state_value === 0);
      expect(at0?.forced_inputs.e).toBe(1);
    } else {
      throw new Error("expected an environment counterstrategy");
    }
  });

  it("omits the strategy for a combinational-output / relational target", async () => {
    // FIFO-class target: `good` is a combinational output (`full_o`), not a state register — the verdict
    // decides but the state-indexed strategy is absent. `realizable` + `holds_under` still apply.
    vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: {
        realizable: false,
        good: "full_o == 1",
        controllable: ["incr_wptr_i"],
        holds_under: [
          {
            phi: "incr_rptr_i == 0",
            kind: "InputHold",
            non_vacuous: true,
            engine: "two-player game realizable under env-input hold",
          },
        ],
      } as Btor2GameResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const out = await runBtor2Game({
      content: "…fifo btor2…",
      good: "full_o == 1",
      controllable: ["incr_wptr_i"],
      discover_assumptions: true,
    });

    expect(out.realizable).toBe(false);
    expect(out.strategy).toBeUndefined();
    expect(out.holds_under?.[0]?.phi).toBe("incr_rptr_i == 0");
  });

  it("sends discover_assumptions and parses the holds_under assumption", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: {
        ...environmentResponse,
        holds_under: [
          {
            phi: "e == 0",
            kind: "InputHold",
            non_vacuous: true,
            engine: "two-player game realizable under env-input hold",
          },
        ],
      } as Btor2GameResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const out = await runBtor2Game({
      content: "1 sort bitvec 1\n2 input 1 c\n3 input 1 e\n4 state 1 st\n",
      good: "st == 1",
      controllable: ["c"],
      discover_assumptions: true,
    });

    const [, payload] = postSpy.mock.calls[0];
    expect((payload as Btor2GameRequest).discover_assumptions).toBe(true);
    // Unrealizable, but an environment assumption makes it realizable (conditional-only).
    expect(out.realizable).toBe(false);
    expect(out.holds_under?.[0]?.phi).toBe("e == 0");
    expect(out.holds_under?.[0]?.non_vacuous).toBe(true);
  });

  it("sends assume_clock_reset in the request body", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: { ...controllerResponse } as Btor2GameResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });
    await runBtor2Game({
      content: "1 sort bitvec 1\n2 input 1 c\n3 input 1 rst\n4 state 1 st\n",
      good: "st == 1",
      controllable: ["c"],
      assume_clock_reset: true,
    });
    const [, payload] = postSpy.mock.calls[0];
    expect((payload as Btor2GameRequest).assume_clock_reset).toBe(true);
  });

  it("sends the recurrence objective and returns a verdict-only (strategy-less) result", async () => {
    // Büchi objective: force `good` infinitely often. Recurrence is verdict-only today (no strategy).
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: {
        realizable: true,
        good: "st == 1",
        objective: "recurrence",
        controllable: ["c"],
      } as Btor2GameResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const out = await runBtor2Game({
      content: "1 sort bitvec 1\n2 input 1 c\n3 input 1 e\n4 state 1 st\n",
      good: "st == 1",
      controllable: ["c"],
      objective: "recurrence",
    });

    const [, payload] = postSpy.mock.calls[0];
    expect((payload as Btor2GameRequest).objective).toBe("recurrence");
    expect(out.realizable).toBe(true);
    expect(out.objective).toBe("recurrence");
    expect(out.strategy).toBeUndefined();
  });

  it("parses a discovered fairness (GF) assumption on an unrealizable recurrence game", async () => {
    // `GF a → GF good`: unrealizable recurrence, rescued by a liveness assumption (conditional-only).
    vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: {
        realizable: false,
        good: "count == 1",
        objective: "recurrence",
        controllable: ["c"],
        holds_under: [
          {
            phi: "GF(e == 0)",
            kind: "InputFairness",
            non_vacuous: true,
            engine: "two-player GR(1) game realizable under env-input fairness",
          },
        ],
      } as Btor2GameResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const out = await runBtor2Game({
      content: "…buffer btor2…",
      good: "count == 1",
      controllable: ["c"],
      objective: "recurrence",
      discover_assumptions: true,
    });

    expect(out.realizable).toBe(false);
    expect(out.holds_under?.[0]?.kind).toBe("InputFairness");
    expect(out.holds_under?.[0]?.phi).toBe("GF(e == 0)");
  });

  it("parses a discovered fairness CONJUNCTION when no single assumption suffices", async () => {
    vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: {
        realizable: false,
        good: "st == 2",
        objective: "recurrence",
        controllable: ["c"],
        holds_under: [
          {
            phi: "GF(e1 == 0) && GF(e2 == 0)",
            kind: "InputFairnessConjunction",
            non_vacuous: true,
            engine:
              "two-player multi-pair GR(1) game realizable under env-input fairness conjunction",
          },
        ],
      } as Btor2GameResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const out = await runBtor2Game({
      content: "…twogate btor2…",
      good: "st == 2",
      controllable: ["c"],
      objective: "recurrence",
      discover_assumptions: true,
    });

    expect(out.holds_under?.[0]?.kind).toBe("InputFairnessConjunction");
    expect(out.holds_under?.[0]?.phi).toContain("GF(e1 == 0)");
    expect(out.holds_under?.[0]?.phi).toContain("GF(e2 == 0)");
  });

  it("returns the recurrence stall lasso as a `lasso` trace", async () => {
    // mununu 0.5: the former `stall_lasso: {prefix, cycle, inputs}` is a `trace`
    // whose steps from `loop_start` repeat forever.
    vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: {
        ...environmentResponse,
        objective: "recurrence",
        strategy: undefined,
        trace: {
          kind: "lasso",
          loop_start: 1,
          steps: [
            {
              cycle: 0,
              state: [{ register: "st", value: 0, hex: "0x0", bits: 1 }],
              inputs: [{ register: "e", value: 1, hex: "0x1", bits: 1 }],
            },
            {
              cycle: 1,
              state: [{ register: "st", value: 0, hex: "0x0", bits: 1 }],
              inputs: [{ register: "e", value: 0, hex: "0x0", bits: 1 }],
            },
          ],
        },
      } as Btor2GameResponse,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const out = await runBtor2Game({
      content: "…btor2…",
      good: "st == 1",
      controllable: ["c"],
      objective: "recurrence",
    });

    expect(out.outcome).toBe("violated");
    expect(out.trace?.kind).toBe("lasso");
    expect(out.trace?.loop_start).toBe(1);
    expect(out.trace?.steps[1].inputs?.[0].register).toBe("e");
  });
});
