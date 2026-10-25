/**
 * Unified extraction workflow definitions.
 *
 * Each domain (RTL, software extraction, XState, etc.) is described as a
 * data-driven WorkflowDefinition with ordered steps. The UI renders the
 * workflow generically from these definitions — adding a new domain
 * requires only a new entry in WORKFLOW_REGISTRY.
 */

// ---------------------------------------------------------------------------
// Core types
// ---------------------------------------------------------------------------

export type StepTimeout = "standard" | "extended";

export interface WorkflowStep {
  /** Unique step identifier within the workflow. */
  id: string;
  /** Human-readable label shown in the stepper. */
  label: string;
  /** Longer description for tooltips / help text. */
  description: string;
  /** API endpoint to call (relative to /api/v1), or null for client-side steps. */
  endpoint: string | null;
  /** Whether this step can be skipped. */
  optional: boolean;
  /** Whether this step can be re-run after completion. */
  repeatable: boolean;
  /** Step IDs that must be completed before this step is available. */
  requires: string[];
  /** Which HTTP client to use: "standard" (10s) or "extended" (120s). */
  timeout: StepTimeout;
}

export interface WorkflowDefinition {
  /** Unique domain identifier. */
  domain: string;
  /** Human-readable name. */
  displayName: string;
  /** Short description of what this domain covers. */
  description: string;
  /** File extensions that trigger this workflow. */
  sourceExtensions: string[];
  /** JSON Schema path for the sidecar editor (null if no sidecar). */
  sidecarSchema: string | null;
  /** Sidecar file extension for display. */
  sidecarExtension: string;
  /** Ordered workflow steps. */
  steps: WorkflowStep[];
}

// ---------------------------------------------------------------------------
// Domain workflow definitions
// ---------------------------------------------------------------------------

const rtlWorkflow: WorkflowDefinition = {
  domain: "rtl",
  displayName: "SystemVerilog RTL",
  description:
    "Hardware register-transfer-level verification. Builds Kripke structures from registers and combinational logic.",
  sourceExtensions: [".sv", ".v"],
  sidecarSchema: "/schemas/mununu-sv-annotation.schema.json",
  sidecarExtension: ".mununu.json",
  steps: [
    {
      id: "load",
      label: "Load Source",
      description: "Load a SystemVerilog source file (.sv / .v)",
      endpoint: null,
      optional: false,
      repeatable: false,
      requires: [],
      timeout: "standard",
    },
    {
      id: "edit_sidecar",
      label: "Edit Sidecar",
      description:
        "Author / refine the .mununu.json sidecar (signal abstractions, properties, controllability). Auto-scaffolding and SMT value discovery moved to the `mununu btor2 discover` CLI when the native SV parser frontend was retired (S.2b).",
      endpoint: null,
      optional: true,
      repeatable: true,
      requires: ["load"],
      timeout: "standard",
    },
    {
      id: "translate",
      label: "Translate",
      description:
        "Generate CTXDSL from SystemVerilog + sidecar via the sv-yosys pipeline (sv2v → Yosys → BTOR2 → bit-blast). Builds the Kripke structure.",
      endpoint: "/context/import",
      optional: false,
      repeatable: true,
      requires: ["load"],
      timeout: "standard",
    },
    {
      id: "verify",
      label: "Verify",
      description: "Evaluate properties against the generated model",
      endpoint: "/context/eval",
      optional: false,
      repeatable: true,
      requires: ["translate"],
      timeout: "extended",
    },
    {
      id: "extract_sva",
      label: "Extract SVA",
      description:
        "Extract the design's SystemVerilog Assertions (assert / assume / cover property) and translate the supported Tier-1/Tier-2 fragment to mu-calculus via the slang front-end — including each cover's AG-EF recoverability companion and the $past shadow registers the formulas need. No verification; feed a translated formula into the CEGAR step.",
      endpoint: "/sv/extract-sva",
      optional: true,
      repeatable: true,
      requires: ["load"],
      timeout: "standard",
    },
    {
      id: "cegar",
      label: "CEGAR (predicate abstraction)",
      description:
        "SV-direct predicate-abstraction refinement: lift SV → flattened BTOR2 (sv2v + Yosys) → KMTS predicate cube → μ-calculus 3-valued { T, F, ⊥ } verdict, refining on ⊥. An alternative to the bit-blast Translate→Verify path for designs whose state space exceeds the explicit cap. Needs only the loaded SV.",
      endpoint: "/sv/cegar",
      optional: true,
      repeatable: true,
      requires: ["load"],
      timeout: "extended",
    },
    {
      id: "verify_auto",
      label: "Verify SVA (no sidecar)",
      description:
        "No-sidecar SVA verification: extract the design's assertions, lift SV → BTOR2, and verify each property against the model — auto-seeding cube predicates from the formula's state-cell atoms and running predicate-abstraction refinement. Renders a per-property 3-valued { HOLDS, VIOLATED, ⊥ } verdict; combinational/IO properties are reported skipped. Needs only the loaded SV.",
      endpoint: "/sv/verify-auto",
      optional: true,
      repeatable: true,
      requires: ["load"],
      timeout: "extended",
    },
  ],
};

const softwareWorkflow: WorkflowDefinition = {
  domain: "software",
  displayName: "Software Extraction",
  description:
    "Extract state machines from TypeScript, Python, or Rust source code via AST analysis.",
  sourceExtensions: [".ts", ".tsx", ".py", ".rs"],
  sidecarSchema: "/schemas/extraction-spec.schema.json",
  sidecarExtension: ".espec.json",
  steps: [
    {
      id: "load",
      label: "Load Source",
      description: "Load a source file to extract from",
      endpoint: null,
      optional: false,
      repeatable: false,
      requires: [],
      timeout: "standard",
    },
    {
      id: "extract",
      label: "Extract Model",
      description:
        "AST-based extraction: identify state fields, methods, guards, and effects",
      endpoint: "/extraction/extract",
      optional: false,
      repeatable: true,
      requires: ["load"],
      timeout: "standard",
    },
    {
      id: "compose",
      label: "Compose Instances",
      description:
        "Optional: declare multiple instances of the extracted classes plus shared labels. Use this for concurrency / race-condition modeling (N workers contending for a shared resource). Skip for single-class verification.",
      endpoint: null,
      optional: true,
      repeatable: true,
      requires: ["extract"],
      timeout: "standard",
    },
    {
      id: "validate",
      label: "Validate Anchors",
      description:
        "Check that line anchors in the extraction spec still match the source code",
      endpoint: "/extraction/validate",
      optional: true,
      repeatable: true,
      requires: ["extract"],
      timeout: "standard",
    },
    {
      id: "edit_sidecar",
      label: "Edit Spec",
      description:
        "Refine the .espec.json: adjust transitions, properties, mode filtering",
      endpoint: null,
      optional: true,
      repeatable: true,
      requires: ["extract"],
      timeout: "standard",
    },
    {
      id: "translate",
      label: "Translate",
      description: "Generate CTXDSL from the extraction spec",
      endpoint: "/context/import",
      optional: false,
      repeatable: true,
      requires: ["extract"],
      timeout: "standard",
    },
    {
      id: "verify",
      label: "Verify",
      description: "Evaluate properties against the extracted model",
      endpoint: "/context/eval",
      optional: false,
      repeatable: true,
      requires: ["translate"],
      timeout: "extended",
    },
  ],
};

const xstateWorkflow: WorkflowDefinition = {
  domain: "xstate",
  displayName: "XState / Statecharts",
  description:
    "Verify XState state machine definitions. Supports hierarchy flattening and parallel regions.",
  sourceExtensions: [".xstate.json", ".xstate"],
  sidecarSchema: null,
  sidecarExtension: "",
  steps: [
    {
      id: "load",
      label: "Load Machine",
      description: "Load an XState JSON state machine definition",
      endpoint: null,
      optional: false,
      repeatable: false,
      requires: [],
      timeout: "standard",
    },
    {
      id: "translate",
      label: "Translate",
      description: "Flatten hierarchy and generate CTXDSL",
      endpoint: "/context/import",
      optional: false,
      repeatable: true,
      requires: ["load"],
      timeout: "standard",
    },
    {
      id: "verify",
      label: "Verify",
      description: "Evaluate properties against the state machine",
      endpoint: "/context/eval",
      optional: false,
      repeatable: true,
      requires: ["translate"],
      timeout: "extended",
    },
  ],
};

const crewaiWorkflow: WorkflowDefinition = {
  domain: "crewai",
  displayName: "CrewAI Agentic",
  description:
    "Verify CrewAI agentic JSON crews. Per-agent automata (Idle -> Executing -> Done) plus a sequential supervisor composed asynchronously, dispatched via the native CrewaiAdapter.",
  sourceExtensions: [".crewai.json", ".crewai"],
  sidecarSchema: null,
  sidecarExtension: "",
  steps: [
    {
      id: "load",
      label: "Load Crew",
      description: "Load a CrewAI JSON crew definition (.crewai.json)",
      endpoint: null,
      optional: false,
      repeatable: false,
      requires: [],
      timeout: "standard",
    },
    {
      id: "translate",
      label: "Translate",
      description:
        "Translate the crew into per-agent automata + sequential supervisor (asynchronous composition)",
      endpoint: "/context/import",
      optional: false,
      repeatable: true,
      requires: ["load"],
      timeout: "standard",
    },
    {
      id: "verify",
      label: "Verify",
      description:
        "Evaluate agentic property templates (bounded_handoff, no_delegation_cycle, eventual_completion) over the composed crew",
      endpoint: "/context/eval",
      optional: false,
      repeatable: true,
      requires: ["translate"],
      timeout: "extended",
    },
  ],
};

const langgraphWorkflow: WorkflowDefinition = {
  domain: "langgraph",
  displayName: "LangGraph Workflow",
  description:
    "Verify LangGraph StateGraph workflows. Nodes become states; edges become `node_<from>_enter` transitions (conditional edges get the condition suffix). Dispatched via the native LangGraphAdapter.",
  sourceExtensions: [".langgraph.json", ".langgraph"],
  sidecarSchema: null,
  sidecarExtension: "",
  steps: [
    {
      id: "load",
      label: "Load Graph",
      description: "Load a LangGraph StateGraph JSON export (.langgraph.json)",
      endpoint: null,
      optional: false,
      repeatable: false,
      requires: [],
      timeout: "standard",
    },
    {
      id: "translate",
      label: "Translate",
      description:
        "Translate the StateGraph into a CTXDSL automaton; conditional edges fan out into per-condition transitions",
      endpoint: "/context/import",
      optional: false,
      repeatable: true,
      requires: ["load"],
      timeout: "standard",
    },
    {
      id: "verify",
      label: "Verify",
      description:
        "Evaluate properties (reachability, termination, mutual exclusion) over the LangGraph automaton",
      endpoint: "/context/eval",
      optional: false,
      repeatable: true,
      requires: ["translate"],
      timeout: "extended",
    },
  ],
};

const btor2Workflow: WorkflowDefinition = {
  domain: "btor2",
  displayName: "BTOR2 + CEGAR",
  description:
    "Predicate-abstraction refinement (CEGAR) over a BTOR2 design. Lifts to a KMTS predicate cube and evaluates a μ-calculus formula with the 3-valued { T, F, ⊥ } verdict, refining on ⊥. (Produce BTOR2 from SV with `mununu sv emit-btor2-per-module`.)",
  sourceExtensions: [".btor2", ".btor"],
  sidecarSchema: null,
  sidecarExtension: "",
  steps: [
    {
      id: "load",
      label: "Load BTOR2",
      description: "Load a BTOR2 design file (.btor2 / .btor)",
      endpoint: null,
      optional: false,
      repeatable: false,
      requires: [],
      timeout: "standard",
    },
    {
      id: "cegar",
      label: "Run CEGAR",
      description:
        "Configure the formula + initial predicate set + refinement options, then run the CEGAR loop and inspect the per-iteration refinement trace and 3-valued verdict.",
      endpoint: "/btor2/cegar",
      optional: false,
      repeatable: true,
      requires: ["load"],
      timeout: "extended",
    },
  ],
};

const verifyProjectWorkflow: WorkflowDefinition = {
  domain: "verify-project",
  displayName: "Verify Project (verify.toml)",
  description:
    "Drive the verify framework end-to-end from a verify.toml manifest. Supports N heterogeneous sources, three alphabet-binding strategies (direct / renamings / register_map), and configurable composition + property lists.",
  sourceExtensions: [".verify.toml", "verify.toml"],
  sidecarSchema: null,
  sidecarExtension: "",
  steps: [
    {
      id: "load",
      label: "Load Manifest",
      description:
        "Load a verify.toml manifest plus its referenced source files",
      endpoint: null,
      optional: false,
      repeatable: false,
      requires: [],
      timeout: "standard",
    },
    {
      id: "verify",
      label: "Run Verify",
      description:
        "Run the orchestrator: dispatch each source, apply the alphabet binding, assemble the unified CTXDSL, evaluate every declared property",
      endpoint: "/verify",
      optional: false,
      repeatable: true,
      requires: ["load"],
      timeout: "extended",
    },
  ],
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Registry of all available extraction workflows.
 *
 * To add a new domain:
 * 1. Define a WorkflowDefinition (like rtlWorkflow above)
 * 2. Add it to this map
 * 3. Optionally add a sidecar JSON Schema to /public/schemas/
 *
 * The DomainSelector component renders from this registry automatically.
 */
export const WORKFLOW_REGISTRY: Record<string, WorkflowDefinition> = {
  rtl: rtlWorkflow,
  software: softwareWorkflow,
  xstate: xstateWorkflow,
  crewai: crewaiWorkflow,
  langgraph: langgraphWorkflow,
  btor2: btor2Workflow,
  "verify-project": verifyProjectWorkflow,
};

/**
 * Get a workflow definition by domain name.
 */
export function getWorkflow(domain: string): WorkflowDefinition | undefined {
  return WORKFLOW_REGISTRY[domain];
}

/**
 * List all available domain names.
 */
export function availableDomains(): string[] {
  return Object.keys(WORKFLOW_REGISTRY);
}
