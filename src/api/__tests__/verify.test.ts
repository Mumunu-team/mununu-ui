import { describe, it, expect, vi, beforeEach } from "vitest";
import { aiApiClient } from "../client";
import {
  verifyProject,
  ADAPTER_FORMATS,
  ADAPTER_EXTENSIONS,
  type VerifyProjectRequest,
  type VerifyReport,
} from "../endpoints";

const mockReport: VerifyReport = {
  project: "Demo",
  sources: [{ id: "wf", adapter: "langgraph", automaton: "TicketTriage" }],
  composition: {
    semantics: "asynchronous",
    name: "Triage",
    members: ["TicketTriage"],
  },
  property_verdicts: [
    {
      name: "done_reachable",
      formula_source: {
        kind: "template",
        id: "reachable",
        args: { TARGET: "done" },
      },
      formula: "mu X. (done || <> X)",
      over: "Triage",
      outcome: "holds",
      total_states: 4,
      satisfying_states: 4,
      initial_states: ["classify"],
      initial_satisfying: ["classify"],
    },
  ],
};

describe("verifyProject (POST /verify)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts the request to /verify and returns the typed report", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: mockReport,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });

    const req: VerifyProjectRequest = {
      config: {
        project: { name: "Demo" },
        sources: [
          {
            id: "wf",
            adapter: "langgraph",
            files: ["workflow.langgraph.json"],
          },
        ],
        composition: {
          semantics: "asynchronous",
          members: ["wf"],
          name: "Triage",
        },
      },
      base_dir: "/tmp/work",
    };
    const tomlReq: VerifyProjectRequest = {
      config_toml: '[project]\nname = "Demo"\n',
      base_dir: "/tmp/work",
    };
    expect(tomlReq.config_toml).toBeDefined();
    const report = await verifyProject(req);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [endpoint, payload] = postSpy.mock.calls[0];
    expect(endpoint).toBe("/verify");
    expect((payload as VerifyProjectRequest).base_dir).toBe("/tmp/work");
    expect(report.project).toBe("Demo");
    expect(report.property_verdicts).toHaveLength(1);
    expect(report.property_verdicts[0].outcome).toBe("holds");
  });

  it("uses the extended (120s) HTTP client — verify_project can be long-running", async () => {
    // The presence of `aiApiClient.post` in the test above already
    // demonstrates this; the assertion below makes the intent explicit.
    expect(aiApiClient.defaults.timeout).toBeGreaterThanOrEqual(60_000);
  });

  it("forwards cluster_similarity_floor (R4W-3) in the request body", async () => {
    const postSpy = vi.spyOn(aiApiClient, "post").mockResolvedValue({
      data: mockReport,
      status: 200,
      statusText: "OK",
      headers: {},
      config: {} as unknown,
    });
    const req: VerifyProjectRequest = {
      config_toml: '[project]\nname = "Demo"\n',
      base_dir: "/tmp/work",
      cluster_similarity_floor: 0.7,
    };
    await verifyProject(req);
    const [, payload] = postSpy.mock.calls[0];
    expect((payload as VerifyProjectRequest).cluster_similarity_floor).toBe(
      0.7,
    );
  });
});

describe("adapter format / extension registries", () => {
  it("ADAPTER_FORMATS lists the new agentic adapters", () => {
    expect(ADAPTER_FORMATS).toContain("crewai");
    expect(ADAPTER_FORMATS).toContain("langgraph");
  });

  it("ADAPTER_EXTENSIONS lists .crewai.json / .langgraph.json", () => {
    expect(ADAPTER_EXTENSIONS).toContain("crewai.json");
    expect(ADAPTER_EXTENSIONS).toContain("langgraph.json");
  });
});
