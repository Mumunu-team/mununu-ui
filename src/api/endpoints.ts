import { apiClient, aiApiClient } from "./client";
import type { paths } from "./types";

// Context endpoint type aliases
type ContextSummarizeRequest =
  paths["/api/v1/context/summarize"]["post"]["requestBody"]["content"]["application/json"];
type ContextSummarizeResponse =
  paths["/api/v1/context/summarize"]["post"]["responses"]["200"]["content"]["application/json"];

type ContextGraphsRequest =
  paths["/api/v1/context/graphs"]["post"]["requestBody"]["content"]["application/json"] & {
    include_controllers?: boolean;
    minimize_controllers?: boolean;
  };
type ContextGraphsResponse =
  paths["/api/v1/context/graphs"]["post"]["responses"]["200"]["content"]["application/json"];

// Verification types (matches mununu backend /api/v1/context/verify)
export interface ContextVerifyRequest {
  context: { name: string; content: string };
  sidecars?: { name: string; content: string }[];
  formula?: string;
  /** Template reference (alternative to formula). */
  template_ref?: { template: string; args: Record<string, string> };
  automaton?: string;
  counterstrategy?: boolean;
  minimize_counterstrategy?: boolean;
  /** Labels to hide (reclassify as internal) before evaluation. */
  hide?: string[];
  /** Apply bisimulation minimization before evaluation. */
  minimize?: boolean;
  /** Stub .espec.json content to compose as sidecars. */
  stubs?: { name: string; content: string }[];
}

export interface GraphElementData {
  id: string;
  label?: string;
  parent?: string;
  source?: string;
  target?: string;
  action_type?: string;
  type?: string;
  [key: string]: unknown;
}

export interface GraphElement {
  data: GraphElementData;
  position?: { x: number; y: number };
  classes?: string;
}

export interface CounterstrategyResult {
  environment_winning_states: string[];
  graph_elements: GraphElement[];
  inverted_formula: string;
  minimized: boolean;
}

export interface FormulaVerificationResult {
  formula_name: string;
  automaton: string;
  satisfied: boolean;
  total_states: number;
  satisfying_states: number;
  initial_states: string[];
  initial_satisfying: string[];
  initial_violating: string[];
  satisfying_state_names: string[];
  counterstrategy?: CounterstrategyResult;
}

export interface ContextVerifyResponse {
  success: boolean;
  all_satisfied: boolean;
  results: FormulaVerificationResult[];
}

// Context endpoints
export const summarizeContext = async (
  request: ContextSummarizeRequest,
): Promise<ContextSummarizeResponse> => {
  const response = await apiClient.post<ContextSummarizeResponse>(
    "/context/summarize",
    request,
  );
  return response.data;
};

export const getContextGraphs = async (
  request: ContextGraphsRequest,
): Promise<ContextGraphsResponse> => {
  const response = await apiClient.post<ContextGraphsResponse>(
    "/context/graphs",
    request,
  );
  return response.data;
};

// Verification endpoint
// Uses extended timeout when counterstrategy is requested (formula inversion + evaluation)
export const verifyContext = async (
  request: ContextVerifyRequest,
): Promise<ContextVerifyResponse> => {
  const client = request.counterstrategy ? aiApiClient : apiClient;
  const response = await client.post<ContextVerifyResponse>(
    "/context/verify",
    request,
  );
  return response.data;
};

// Import types (matches mununu backend /api/v1/context/import)
export interface ContextImportRequest {
  content: string;
  format?: string; // "auto", "tlsf", "aiger", "btor2", "promela", "xstate", "systemverilog" (hand-written), "sv-yosys" (Yosys-driven), "extraction"
  filename?: string;
  /** Optional sidecar content (.mununu.json for SV, .espec.json for extraction). */
  sidecar?: string;
  /** Additional source files (for multi-module SV compositions). */
  additional_sources?: { name: string; content: string }[];
  /**
   * When `format === "sv-yosys"`, opt in to the sv2v preprocessor pass
   * before Yosys elaboration. Required for modern open-source SV
   * dialects (SV2009/2012 module-header `import pkg::*;`) that Yosys's
   * built-in parser does not accept. Mirrors the CLI's
   * `--preprocessor sv2v` flag. Ignored by all other formats.
   */
  use_sv2v?: boolean;
  /**
   * R.6.7 / V.6 (2026-06-09) — predicate set for the
   * controllability-aware predicate-cube lift. Each entry is a
   * {name, register, value} triple identifying a register-value
   * equality predicate. When non-empty AND `controllable_inputs` is
   * non-empty AND `format === "btor2"`, the backend's
   * `predicate_cube_lift` is invoked + the resulting KMTS is
   * returned. Mirrors the CLI's `--predicate NAME:REG=VALUE` flag
   * on `mununu btor2 cegar`.
   *
   * SV-yosys routing (run sv2v + Yosys + lift in one call) is a
   * follow-up; today the user runs `mununu sv emit-btor2-per-module`
   * first to produce BTOR2 from SV, then sends the BTOR2 to this
   * endpoint with the controllability-aware fields.
   */
  predicates?: PredicateSpecRequest[];
  /**
   * R.6.7 / V.6 (2026-06-09) — names of BTOR2 input symbols the
   * controller drives. Mirrors the CLI's `--controllable-input`
   * flag. When non-empty AND `predicates` is non-empty, opts the
   * import path into the R.6.6 controllability-aware lift.
   */
  controllable_inputs?: string[];
}

/**
 * R.6.7 / V.6 (2026-06-09) — predicate-spec request shape mirroring
 * the backend `crate::api::models::PredicateSpecRequest`. The
 * `name` is human-readable (e.g. `"burst_zero"`); the `register` is
 * the BTOR2 symbol name; the `value` is the integer constant the
 * predicate witnesses (`register == value`).
 */
export interface PredicateSpecRequest {
  name: string;
  register: string;
  value: number;
}

/**
 * One per-transition observation row from an adapter that exposes
 * Mealy-style outputs. Display-only metadata: the formal evaluator
 * never consults these, but the UI trace renderer matches a row to
 * a CLTS transition by `(source, target)` and shows the observed
 * signal values per cycle in counterexample / counterstrategy traces.
 */
export interface TransitionObservation {
  source: string;
  target: string;
  labels: string[];
  observations: Record<string, string>;
}

export interface ContextImportResponse {
  success: boolean;
  ctxdsl: string;
  source_format: string;
  warnings: string[];
  signal_count: number;
  state_count: number;
  property_count: number;
  /**
   * Per-state structured valuations from cross-product enumeration —
   * keyed by `automaton_name → state_name → { variable: value }`.
   * Populated by the SystemVerilog Kripke builder, the BTOR2 reader,
   * and the extraction adapter.
   */
  state_valuations?: Record<string, Record<string, Record<string, string>>>;
  /**
   * Per-transition Mealy observations — keyed by `automaton_name →
   * list of `TransitionObservation`. Populated by the BTOR2 reader
   * for designs whose outputs depend on `(state, input)`.
   */
  transition_observations?: Record<string, TransitionObservation[]>;
}

// Import endpoint — translate adapter formats to CTXDSL
export const importContext = async (
  request: ContextImportRequest,
): Promise<ContextImportResponse> => {
  const response = await apiClient.post<ContextImportResponse>(
    "/context/import",
    request,
  );
  return response.data;
};

// CEGAR refinement-trace types (matches mununu backend /api/v1/btor2/cegar)

/**
 * U.0 (slot 6) — request for the CEGAR refinement endpoint
 * (`POST /api/v1/btor2/cegar`). Mirrors the CLI `mununu btor2 cegar`:
 * runs the predicate-abstraction-refinement loop over a BTOR2 design
 * and returns the per-iteration refinement trace the viewer renders.
 */
export interface Btor2CegarRequest {
  /** BTOR2 source content. */
  content: string;
  /** μ-calculus formula evaluated over the lifted KMTS. */
  formula: string;
  /**
   * Initial predicate set (bootstraps the `2^|P|` cube space). At least
   * one entry is required. Reuses the `{name, register, value}` shape.
   */
  predicates: PredicateSpecRequest[];
  /**
   * Optional R.6.6 controllability split — controller-driven input
   * symbols (mirrors `--controllable-input`).
   */
  controllable_inputs?: string[];
  /** Predicate-discovery source: `"wp"` (default) | `"craig"`. */
  predicate_source?: string;
  /** Max CEGAR iterations (default 16). */
  max_iterations?: number;
  /**
   * Must-edge inference policy (kebab-case; default `"off"`):
   * `"sampling-confluence"` | `"smt-per-target"` |
   * `"smt-per-target-standard"` | `"smt-hyper-must"`.
   */
  must_edge_inference?: string;
  /**
   * May-edge inference policy (kebab-case; default `"off"`):
   * `"smt-all-pairs"` for the sound all-pairs may-relation. Mirrors the
   * CLI `--may-edge-inference`.
   */
  may_edge_inference?: string;
  /**
   * R-S8 symbolic-init config-values, one entry per register as
   * `"REG=v1,v2,..."` (mirrors the CLI `--config-values`). Each register's
   * admissible power-up set seeds the predicate-cube initial states. Needed
   * for init-hazard properties (e.g. the M.4 Caliptra `boot_fsm_ns` CWE-1245).
   */
  config_values?: string[];
  /**
   * CTXDSL Phase 2 — opt-in (default `false`): when `true`, the response
   * carries a `ctxdsl` field with the final refined cube model + the checked
   * formula as a self-contained CTXDSL document. Mirrors the CLI
   * `--emit-ctxdsl`.
   */
  emit_ctxdsl?: boolean;
  /**
   * R-F5.4.2b — predicate-cube engine: `"explicit"` (default, SMT edges +
   * CEGAR refinement) or `"symbolic"` (R-F5 BDD relation, single-shot, no
   * per-cube-pair SMT — orders of magnitude faster at large `|P|`). Mirrors
   * the CLI `--engine`. The symbolic path handles simple equality predicates +
   * the bare `[]`/`<>` fragment only, performs no refinement (`iterations` is
   * empty), and sets `terminated_with = "symbolic-single-shot"`.
   */
  engine?: string;
}

/** Cell counts of a 3-valued (Kleene) verdict over the cube space. */
export interface CegarVerdictSummary {
  /** KleeneT (definitely-true) cells. */
  true_cells: number;
  /** KleeneF (definitely-false) cells. */
  false_cells: number;
  /** KleeneBot (unknown — needs refinement) cells. */
  unknown_cells: number;
}

/** A predicate spec, response-shaped (`register == value`). */
export interface PredicateView {
  name: string;
  register: string;
  value: number;
}

/**
 * Track I.1 — a cube cell witnessing a non-HOLDS verdict: the cube index plus
 * the predicate valuation (`name → holds`) at that cell. Makes a failing or
 * indefinite verdict actionable ("falsified where `idle=false, err=true`").
 */
export interface WitnessCellView {
  cube_index: number;
  valuation: Record<string, boolean>;
}

/**
 * Track I.1 (trace slice) — a reachability countertrace for a VIOLATED verdict:
 * the ordered sequence of failing cube cells from an initial cell to a trap (a
 * cell whose every successor stays `False`), plus whether the path ends in one.
 */
export interface CounterTraceView {
  steps: WitnessCellView[];
  ends_in_trap: boolean;
}

/** One CEGAR iteration, viewer-shaped. */
export interface CegarIterationView {
  iteration: number;
  /** Predicate-set size at the start of this iteration. */
  predicate_count: number;
  /**
   * `true` iff this iteration's verdict carried `KleeneBot` cells
   * (a failure subgame drove a refinement).
   */
  had_failure_subgame: boolean;
  /** Predicates the source added in response to this iteration. */
  predicates_added: PredicateView[];
  /** Proxy counter for game-position evaluations (reuse diagnostics). */
  game_position_evaluations: number;
  /** Cell-count summary of this iteration's 3-valued verdict. */
  verdict: CegarVerdictSummary;
}

/**
 * U.0 — CEGAR refinement trace. Mirrors the backend
 * `crate::adapter::btor2::cegar::CegarTrace`.
 */
export interface Btor2CegarResponse {
  success: boolean;
  /** Per-iteration refinement records (iteration 0 = initial evaluation). */
  iterations: CegarIterationView[];
  /** Predicate set at termination (initial + every added predicate). */
  final_predicates: PredicateView[];
  /**
   * Why the loop stopped: `"converged"` |
   * `"bounded-iterations-reached"` | `"predicate-source-exhausted"`.
   */
  terminated_with: string;
  /** Cell-count summary of the final 3-valued verdict. */
  verdict: CegarVerdictSummary;
  /** `true` when the eager `predicate_cube_lift` was used (R.2.5 MVP). */
  lazy_lift_pending: boolean;
  /** Whether prior-iteration approximants were threaded forward. */
  approximant_reuse_enabled: boolean;
  /** Soundness / advisory warnings produced during the run. */
  warnings: string[];
  /**
   * Track I.1 — cube cells that falsify the formula (definite-False), each
   * decoded to its predicate valuation. Capped; `verdict.false_cells` is the
   * full total. Empty unless the outcome is VIOLATED. (Optional in the type for
   * back-compat with older mocks; the current backend always populates it.)
   */
  violating_cells?: WitnessCellView[];
  /**
   * Track I.1 — cube cells the abstraction cannot decide (⊥), each decoded to
   * its predicate valuation. Capped; `verdict.unknown_cells` is the full total.
   */
  undecided_cells?: WitnessCellView[];
  /**
   * Track I.1 (trace slice) — reachability countertrace for a VIOLATED verdict.
   * Present only when the property is violated at the initial cell. (Optional in
   * the type for back-compat with older mocks.)
   */
  counterexample?: CounterTraceView;
  /**
   * Track I.1 (undecided-explanation) — when the final verdict still carries ⊥
   * (unknown) cells, the registers the failure subgame flagged as load-bearing.
   * The actionable "why undecided": adding predicates over these registers (or
   * promoting their init policy) may resolve it. Omitted when empty.
   */
  refinement_candidates?: string[];
  /**
   * CTXDSL Phase 2 — the final refined cube model + the checked formula as
   * CTXDSL, present only when the request set `emit_ctxdsl: true`.
   */
  ctxdsl?: string;
}

/**
 * Run the CEGAR predicate-abstraction-refinement loop over a BTOR2
 * design. Z3-heavy — uses the extended (`aiApiClient`, 120s) client.
 */
export const runBtor2Cegar = async (
  request: Btor2CegarRequest,
): Promise<Btor2CegarResponse> => {
  const response = await aiApiClient.post<Btor2CegarResponse>(
    "/btor2/cegar",
    request,
  );
  return response.data;
};

// Multi-engine safety portfolio (matches mununu backend /api/v1/btor2/verify)

/**
 * Request for the multi-engine safety portfolio endpoint
 * (`POST /api/v1/btor2/verify`). Mirrors the CLI `mununu btor2 verify`:
 * decides `bad`-reachability of a BTOR2 design across every available sound
 * engine.
 */
export interface Btor2VerifyRequest {
  /** BTOR2 source content. */
  content: string;
}

/**
 * Canonical property verdict — the single vocabulary every mununu verify surface
 * reports (mirrors the backend `PropertyVerdict`). `"skipped"` = the property was not
 * evaluated (out of the supported fragment / filtered out).
 */
export type PropertyVerdict = "holds" | "violated" | "unknown" | "skipped";

/**
 * Response for `POST /api/v1/btor2/verify` — the canonical property verdict plus the
 * per-engine reachability breakdown.
 */
export interface Btor2VerifyResponse {
  /**
   * The property reading of `bad`-reachability: `"holds"` (`bad` unreachable) |
   * `"violated"` (reachable) | `"unknown"` (undecided / contradiction). The
   * reachability detail is in `reachable_by` / `unreachable_by` + `contradiction`.
   */
  verdict: PropertyVerdict;
  /** Engines that found `bad` reachable (a real counterexample). */
  reachable_by: string[];
  /** Engines that proved `bad` unreachable (a real safety proof). */
  unreachable_by: string[];
  /**
   * `true` when two sound engines disagree — a soundness alarm, not a guess.
   */
  contradiction: boolean;
}

/**
 * Decide `bad`-reachability with the multi-engine safety portfolio (exact ⊕
 * native ⊕ spacer ⊕ btormc ⊕ Pono), merged under the differential-oracle
 * discipline. Z3- and subprocess-heavy — uses the extended (`aiApiClient`,
 * 120s) client.
 */
export const runBtor2Verify = async (
  request: Btor2VerifyRequest,
): Promise<Btor2VerifyResponse> => {
  const response = await aiApiClient.post<Btor2VerifyResponse>(
    "/btor2/verify",
    request,
  );
  return response.data;
};

// Response-liveness at scale (matches mununu backend /api/v1/btor2/verify-liveness)

/**
 * Request for the response-liveness endpoint
 * (`POST /api/v1/btor2/verify-liveness`). Mirrors the CLI
 * `mununu btor2 verify-liveness`: decides `AG(request → AF grant)` via the
 * liveness-to-safety reduction + the portfolio. `request` / `grant` are
 * register-comparison atom strings (e.g. `"st == 1"`).
 */
export interface Btor2VerifyLivenessRequest {
  /** BTOR2 source content. */
  content: string;
  /** The request atom (`"REG op VALUE"`). */
  request: string;
  /** The grant atom that must eventually follow on every path. */
  grant: string;
}

/** Response for `POST /api/v1/btor2/verify-liveness`. */
export interface Btor2VerifyLivenessResponse {
  /** The canonical property verdict: `"holds"` | `"violated"` | `"unknown"`. */
  verdict: PropertyVerdict;
  /** The reduced property, echoed: `AG((<request>) -> AF (<grant>))`. */
  property: string;
  /** Portfolio engines that decided the reduced `bad`-reachability query. */
  decided_by: string[];
}

/**
 * Decide a response-liveness property `AG(request → AF grant)` at scale via the
 * liveness-to-safety reduction + the multi-engine portfolio. Z3- and
 * subprocess-heavy — uses the extended (`aiApiClient`, 120s) client.
 */
export const runBtor2VerifyLiveness = async (
  request: Btor2VerifyLivenessRequest,
): Promise<Btor2VerifyLivenessResponse> => {
  const response = await aiApiClient.post<Btor2VerifyLivenessResponse>(
    "/btor2/verify-liveness",
    request,
  );
  return response.data;
};

/**
 * Request for the conjunctive response-liveness endpoint
 * (`POST /api/v1/btor2/verify-liveness-all`). Mirrors the CLI
 * `mununu btor2 verify-liveness-all`: decides `⋀ᵢ AG(aᵢ → AF bᵢ)`. Each `responses`
 * entry is a `"ANTE => CONS"` pair of register-comparison atoms (at least one).
 */
export interface Btor2VerifyLivenessAllRequest {
  /** BTOR2 source content. */
  content: string;
  /** The response pairs, each `"ANTE => CONS"`. At least one required. */
  responses: string[];
}

/**
 * Decide a conjunction of response-liveness properties `⋀ᵢ AG(aᵢ → AF bᵢ)` via N
 * liveness-to-safety reductions + the multi-engine portfolio. Reuses the
 * {@link Btor2VerifyLivenessResponse} shape (the `property` echoes the conjunction).
 * Z3-/subprocess-heavy — uses the extended (`aiApiClient`, 120s) client.
 */
export const runBtor2VerifyLivenessAll = async (
  request: Btor2VerifyLivenessAllRequest,
): Promise<Btor2VerifyLivenessResponse> => {
  const response = await aiApiClient.post<Btor2VerifyLivenessResponse>(
    "/btor2/verify-liveness-all",
    request,
  );
  return response.data;
};

/**
 * Request for the fair-cycle response-liveness endpoint
 * (`POST /api/v1/btor2/verify-liveness-under-fairness`, mununu#477 Option B).
 * Mirrors the CLI `mununu btor2 verify-liveness-under-fairness`: decides
 * `(⋀ⱼ GF fairⱼ) → AG(request → AF grant)` via the Emerson–Lei fair-cycle l2s.
 * Empty `fairness` recovers {@link Btor2VerifyLivenessRequest} exactly.
 */
export interface Btor2VerifyLivenessUnderFairnessRequest {
  /** BTOR2 source content. */
  content: string;
  /** The request atom (`"REG op VALUE"`). */
  request: string;
  /** The grant atom that must eventually follow on every path. */
  grant: string;
  /**
   * Fairness atoms — each a `"REG op VALUE"` register-comparison atom whose
   * satisfaction is assumed to hold infinitely often on every path considered.
   * Empty recovers the plain `verify-liveness` semantics.
   */
  fairness?: string[];
}

/**
 * Decide `(⋀ⱼ GF fairⱼ) → AG(request → AF grant)` via the Emerson–Lei fair-cycle
 * l2s + the multi-engine portfolio. Reuses the {@link Btor2VerifyLivenessResponse}
 * shape. Z3-/subprocess-heavy — uses the extended (`aiApiClient`, 120s) client.
 */
export const runBtor2VerifyLivenessUnderFairness = async (
  request: Btor2VerifyLivenessUnderFairnessRequest,
): Promise<Btor2VerifyLivenessResponse> => {
  const response = await aiApiClient.post<Btor2VerifyLivenessResponse>(
    "/btor2/verify-liveness-under-fairness",
    request,
  );
  return response.data;
};

// Recoverability AG EF good (matches mununu backend /api/v1/btor2/verify-recoverability)

/** A concrete assignment of config leaves to values — one point in the config space. */
export type ConfigValuation = Array<[string, number]>;

/** The best-effort "why ⊥ / what would decide it" structural hint. */
export interface RecoverabilityBotDiagnosis {
  /** Recovery-gating down-counters with an un-certified descent: `[name, width]`. */
  uncertified_counters: Array<[string, number]>;
  /** Wide data/config state the recovery value rides: `[name, width]`. */
  wide_influences: Array<[string, number]>;
}

/** The recovery target is never reachable — the `AG EF` verdict is degenerate. */
export interface VacuityWitness {
  good_unreachable: boolean;
  note: string;
}

/** A config-scoped partition of the verdict (refined-verdicts capability A / Phase 1). */
export interface ConfigPartition {
  config_atoms: Array<[string, number]>;
  holds: ConfigValuation[];
  violated: ConfigValuation[];
  unknown: ConfigValuation[];
  vacuous: ConfigValuation[];
  /** True only when the enumerated config set is the COMPLETE reachable set. */
  exhaustive: boolean;
  engine: string;
}

/** An environment assumption under which the property holds (capability B / Phase 2). */
export interface DiscoveredAssumption {
  phi: string;
  kind:
    | "InputHold"
    | "InputConjunction"
    | "InputSchedule"
    | "ResetEventually"
    | "EnvStrategy"
    // A LIVENESS/fairness assumption `GF(in == v)` (env input holds `v` infinitely often) under which
    // an unrealizable RECURRENCE game `GF good` becomes realizable (`GF a → GF good`, GR(1) 1-pair).
    | "InputFairness"
    // A CONJUNCTION of fairness assumptions `GF(a) && GF(b) && …` — the minimal set of liveness
    // assumptions under which a recurrence game becomes realizable ((⋀ GF aᵢ) → GF good, multi-pair
    // GR(1)) when no single fairness assumption suffices.
    | "InputFairnessConjunction";
  non_vacuous: boolean;
  engine: string;
}

/**
 * A structured elaboration of a verdict, carried ALONGSIDE the canonical `verdict` — never replaces
 * it (a config/assumption scope is not a sound unconditional verdict). Present only when `refine` was
 * requested and it produced something; empty (`{}`) when there is nothing to refine.
 */
export interface VerdictRefinement {
  vacuous?: VacuityWitness;
  config_partition?: ConfigPartition;
  holds_under?: DiscoveredAssumption[];
  bot_diagnosis?: RecoverabilityBotDiagnosis;
}

/**
 * Request for the recoverability endpoint
 * (`POST /api/v1/btor2/verify-recoverability`). Mirrors the CLI
 * `mununu btor2 verify-recoverability`: decides `AG EF target` — "from every
 * reachable state, can the design get back to `target`?", the branching property
 * SVA cannot state. `target` is a register-comparison atom string (`"state_q == 3"`).
 */
export interface Btor2VerifyRecoverabilityRequest {
  /** BTOR2 source content. */
  content: string;
  /** The `good` atom to recover to (`"REG op VALUE"`). */
  target: string;
  /**
   * Optional extra abstraction predicates (`"NAME:REG=VALUE"`) that refine the
   * predicate-cube when the exact engine abstains (over its ~40-bit cap) and the
   * `smt-hyper-must` scale path runs. The escalation is automatic; these only help
   * the cube path decide. Omit for the common (small/medium) case.
   */
  predicates?: string[];
  /**
   * Also compute a structured `refinement` alongside the verdict — a `vacuous` witness when the
   * target is never reachable, and a "why ⊥" hint. Diagnostic-only: it never changes the verdict.
   * Mirrors the CLI `--refine`. Omit for the plain verdict.
   */
  refine?: boolean;
  /**
   * Config-partition (capability A): config inputs to split the verdict over, each `"NAME=v1,v2,..."`.
   * The `refinement.config_partition` then reports "holds for configs {A}, violated for {B}", decided
   * exactly per config. Implies the refined output. Mirrors the CLI `--config-values`.
   */
  config_values?: string[];
  /**
   * Assumption discovery (capability B): when the property does NOT hold, search for an environment
   * assumption φ under which it becomes a non-vacuous HOLDS → `refinement.holds_under`. Conditional-only
   * (never changes the canonical verdict). Implies the refined output. Mirrors the CLI
   * `--discover-assumptions`.
   */
  discover_assumptions?: boolean;
}

/** Response for `POST /api/v1/btor2/verify-recoverability`. */
export interface Btor2VerifyRecoverabilityResponse {
  /**
   * Canonical property verdict — `"holds"` (every reachable state can reach
   * `target`) | `"violated"` (a reachable trap cannot) | `"unknown"` (over the
   * exact engine's cap; the cube + smt-hyper-must path scales it).
   */
  verdict: PropertyVerdict;
  /** The decided property, echoed: `AG EF (<target>)`. */
  property: string;
  /** The structured refinement, when `refine` was requested and it produced one. */
  refinement?: VerdictRefinement;
}

/**
 * Decide recoverability `AG EF target` with the exact 3-valued engine (sound at
 * every alternation depth). Z3-heavy — uses the extended (`aiApiClient`, 120s)
 * client.
 */
export const runBtor2VerifyRecoverability = async (
  request: Btor2VerifyRecoverabilityRequest,
): Promise<Btor2VerifyRecoverabilityResponse> => {
  const response = await aiApiClient.post<Btor2VerifyRecoverabilityResponse>(
    "/btor2/verify-recoverability",
    request,
  );
  return response.data;
};

// Auto FSM-recoverability scan (matches mununu backend /api/v1/btor2/check-fsm)

/**
 * Request for the auto FSM illegal-encoding scan
 * (`POST /api/v1/btor2/check-fsm`). Mirrors the CLI `mununu btor2 check-fsm`:
 * auto-discovers the FSM-like state registers and checks, from the reset state,
 * whether any illegal encoding (a value outside the register's legal set) is
 * reachable — with no user input (the legal set is derived from the design).
 */
export interface Btor2CheckFsmRequest {
  /** BTOR2 source content. */
  content: string;
  /** Max state-register width treated as an FSM (wider = datapath/counter, skipped). */
  max_width?: number;
}

/** One state register's illegal-encoding result in a {@link Btor2CheckFsmResponse}. */
export interface FsmRegisterFinding {
  /** The state register's symbol. */
  register: string;
  /** The legal encodings the register's own logic recognizes (sorted). */
  legal_encodings: number[];
  /**
   * Canonical verdict — `"holds"` (stays within its encoding) | `"violated"` (an
   * illegal encoding is reachable) | `"unknown"` (the portfolio could not decide).
   */
  verdict: PropertyVerdict;
  /** `true` when an illegal encoding is reachable (a finding). */
  illegal_encoding_reachable: boolean;
}

/** Response for `POST /api/v1/btor2/check-fsm`. */
export interface Btor2CheckFsmResponse {
  /** Number of FSM-like state registers scanned. */
  fsm_registers_checked: number;
  /** Number of registers with a reachable illegal encoding (`verdict === "violated"`). */
  illegal_encodings_found: number;
  /** Per-register results. */
  registers: FsmRegisterFinding[];
}

/**
 * Auto-scan every FSM-like state register for a reachable illegal encoding — no user
 * input. A safety property (a reachable out-of-enum value is an unambiguous bug),
 * decided per register by the word-level reachability portfolio. Uses the extended
 * (`aiApiClient`, 120s) client since each register runs the portfolio.
 */
export const runBtor2CheckFsm = async (
  request: Btor2CheckFsmRequest,
): Promise<Btor2CheckFsmResponse> => {
  const response = await aiApiClient.post<Btor2CheckFsmResponse>(
    "/btor2/check-fsm",
    request,
  );
  return response.data;
};

// Two-player game (matches mununu backend /api/v1/btor2/game)
// Decide whether the controller can force the design to a `good` state against every
// environment move, and synthesize the winner's strategy. Surface peer of `mununu btor2 game`.

/**
 * The two-player game winning objective. `reach` = force `good` once; `recurrence` = force `good`
 * infinitely often (the Büchi game). Mirrors the CLI `--objective`.
 */
export type GameObjective = "reach" | "recurrence";

/**
 * Request for the two-player controllable game (`POST /api/v1/btor2/game`).
 * Mirrors the CLI `mununu btor2 game`.
 */
export interface Btor2GameRequest {
  /** BTOR2 source content. */
  content: string;
  /** The target `good` atom (`"REG op VALUE"` / combinational output, e.g. `"full_o == 1"`). */
  good: string;
  /**
   * The winning objective: `"reach"` (default) = force `good` once; `"recurrence"` = force `good`
   * infinitely often (Büchi). Strategy + assumption discovery apply to `reach` only today.
   */
  objective?: GameObjective;
  /**
   * The controller-owned primary inputs; every other primary input is the (adversarial)
   * environment's. A name that is not a real primary input is rejected (400).
   */
  controllable?: string[];
  /**
   * When the game is UNREALIZABLE, also search for an environment ASSUMPTION under which the
   * controller wins (the assume-guarantee wedge) → `holds_under`. Conditional-only (never flips
   * `realizable`); no-op when already realizable. Mirrors the CLI `--discover-assumptions`.
   */
  discover_assumptions?: boolean;
  /**
   * Model the clock and reset as a sound posture instead of adversarial inputs — otherwise a
   * two-player game lets the environment freeze the clock or hold reset (a modeling artifact of the
   * raw lift), spuriously unrealizable. Recommended for real RTL. Mirrors `--assume-clock-reset`.
   */
  assume_clock_reset?: boolean;
}

/** One `(environment-input guard → forced controllable inputs)` move of a Mealy controller. */
export interface MealyMove {
  /** The environment-input valuation this move responds to; empty = env-independent (Moore). */
  env_inputs: Record<string, number>;
  /** The controllable inputs the controller forces in response. */
  forced_ctrl: Record<string, number>;
}

/** One control-state row of a controller (Mealy) strategy. */
export interface MealyEntry {
  /** The value of the strategy's state register. */
  state_value: number;
  /** Attractor distance to `good` (`0` = already `good`, no move needed). */
  rank: number;
  /**
   * The controller's move(s): a single `env_inputs`-empty move is a Moore (env-independent)
   * response; several are a genuinely reactive response, one per environment input.
   */
  moves: MealyMove[];
  /** `false` = the reactive-move enumeration hit its bound (partial cover; no silent truncation). */
  complete: boolean;
}

/** One control-state row of an environment (positional) counterstrategy. */
export interface StrategyEntry {
  /** The value of the strategy's state register. */
  state_value: number;
  /** Attractor rank (0 for the environment's safety/maintain counterstrategy). */
  rank: number;
  /** The inputs the strategy forces in this state (name → value); omitted inputs are free. */
  forced_inputs: Record<string, number>;
}

/**
 * The winner's strategy — a discriminated union on `kind`. `controller_strategy` (Mealy) when the
 * game is realizable; `environment_counterstrategy` (positional) when it is not.
 */
export type TwoPlayerStrategy =
  | {
      kind: "controller_strategy";
      /** The state register the strategy is indexed by. */
      state_register: string;
      /** One row per reachable control-state value, sorted by rank then value. */
      entries: MealyEntry[];
    }
  | {
      kind: "environment_counterstrategy";
      /** The state register the counterstrategy is indexed by. */
      state_register: string;
      /** One row per reachable state outside the controller's winning region. */
      entries: StrategyEntry[];
    };

/** Response for `POST /api/v1/btor2/game`. */
/**
 * P2.5-F (b) — the ENVIRONMENT STARVATION LASSO for an unrealizable RECURRENCE game: a concrete play
 * (reset → repeating `¬good` `cycle`, with the env's per-step `inputs`) proving the environment can
 * starve `good` forever — the actionable Büchi counterpart of `realizable = false`. The `inputs` are
 * the actionable signal (e.g. the ack the environment holds low each cycle); replay them in Verilator
 * to observe `good` false on the cycle.
 */
export interface StallLassoView {
  /** States from reset up to (excluding) the cycle entry. */
  prefix: CexCellView[][];
  /** The repeating `¬good` cycle; the last state steps back to `cycle[0]`. */
  cycle: CexCellView[][];
  /** The environment's input at each transition of `prefix ++ cycle` (`inputs[i]` drives step `i`). */
  inputs?: CexCellView[][];
}

export interface Btor2GameResponse {
  /**
   * `true` = the controller can force `good` against every environment move (realizable);
   * `false` = the environment can prevent it (unrealizable).
   */
  realizable: boolean;
  /** The `good` atom, echoed for provenance. */
  good: string;
  /** The winning objective decided, echoed for provenance (`reach` or `recurrence`). */
  objective: GameObjective;
  /** The controller-owned inputs, echoed for provenance. */
  controllable: string[];
  /**
   * The winner's strategy. For `objective = "reach"`: a `controller_strategy` (attractor) when
   * realizable, else an `environment_counterstrategy` (why no controller works — e.g. an ack the
   * environment withholds). For `objective = "recurrence"`: the CONTROLLER's Büchi strategy (force
   * `good` infinitely often) when realizable, absent when not — the unrealizable recurrence witness is
   * `stall_lasso`.
   *
   * Present only for a STATE-register `good`: the strategy is state-indexed, so it is absent for a
   * combinational-output / relational target (a FIFO's `full_o`), where `realizable` + `holds_under`
   * still apply.
   */
  strategy?: TwoPlayerStrategy;
  /**
   * Discovered environment assumption(s) under which the (unrealizable) game becomes realizable —
   * each a conditional `HoldsUnder(φ)` (never flips `realizable`). Present only when
   * `discover_assumptions` was requested and the game is unrealizable.
   */
  holds_under?: DiscoveredAssumption[];
  /**
   * The environment starvation lasso for an unrealizable RECURRENCE game (the Büchi analog of the
   * reach counterstrategy in `strategy`): the concrete play where the environment starves `good`
   * forever. Present only for `objective = "recurrence"` when unrealizable and a simple reachable
   * force-`¬good`-forever region exists.
   */
  stall_lasso?: StallLassoView;
}

/**
 * Solve the two-player controllable game (reach or recurrence) and synthesize the winner's strategy.
 * Uses the extended (`aiApiClient`, 120s) client since it runs the exact-symbolic engine.
 */
export const runBtor2Game = async (
  request: Btor2GameRequest,
): Promise<Btor2GameResponse> => {
  const response = await aiApiClient.post<Btor2GameResponse>(
    "/btor2/game",
    request,
  );
  return response.data;
};

// SV-direct verbs (matches mununu backend /api/v1/sv/verify{,-liveness,-recoverability})
// Lift SV (sv2v + Yosys) then decide a property in one call — no emit-btor2 step.
// They return the same Btor2Verify*Response shapes as the BTOR2-direct verbs.

/** The SV → BTOR2 lift inputs shared by the SV-direct verb requests. */
export interface SvLiftFields {
  /** SystemVerilog primary source content. */
  source: string;
  /** Additional SV sources (packages / includes). */
  additional_sources?: { name: string; content: string }[];
  /** Top module for the lift (auto-detect when omitted). */
  top?: string;
  /** Run sv2v before Yosys (modern SV). Default `false`. */
  use_sv2v?: boolean;
  /** Force the slang RTL front-end (`read_slang`) for modern-SV constructs
   * yosys/sv2v reject (`while` loops, `import pkg::*;`). Requires the
   * yosys-slang plugin server-side. Default `false`. */
  use_slang?: boolean;
}

/** Request for `POST /api/v1/sv/verify` (SV-direct safety portfolio). */
export type SvVerifyRequest = SvLiftFields;

/** Request for `POST /api/v1/sv/verify-liveness` (SV-direct response liveness). */
export interface SvVerifyLivenessRequest extends SvLiftFields {
  /** The request atom (`"REG op VALUE"`). */
  request: string;
  /** The grant atom that must eventually follow on every path. */
  grant: string;
}

/**
 * Request for `POST /api/v1/sv/verify-liveness-all` (SV-direct conjunction of
 * response-liveness properties `⋀ᵢ AG(aᵢ → AF bᵢ)`).
 */
export interface SvVerifyLivenessAllRequest extends SvLiftFields {
  /** The response pairs, each `"ANTE => CONS"`. At least one required. */
  responses: string[];
}

/** Request for `POST /api/v1/sv/verify-recoverability` (SV-direct `AG EF good`). */
export interface SvVerifyRecoverabilityRequest extends SvLiftFields {
  /** The `good` atom to recover to (`"REG op VALUE"`). */
  target: string;
  /**
   * Optional extra abstraction predicates (`"NAME:REG=VALUE"`) for the cube +
   * `smt-hyper-must` scale path (used only when the exact engine abstains over its
   * ~40-bit cap; the escalation is automatic). Omit for the common case.
   */
  predicates?: string[];
  /**
   * Also compute a structured `refinement` alongside the verdict (a `vacuous` witness, an auto
   * `config_partition` over the detected reset, a "why ⊥" hint). Diagnostic-only. Mirrors `--refine`.
   */
  refine?: boolean;
  /**
   * Config-partition (capability A): config inputs to split the verdict over, each `"NAME=v1,v2,..."`
   * → `refinement.config_partition`. Implies the refined output. Mirrors the CLI `--config-values`.
   */
  config_values?: string[];
  /**
   * Assumption discovery (capability B): search for an enabling φ when the property does not hold →
   * `refinement.holds_under` (conditional-only). Mirrors the CLI `--discover-assumptions`.
   */
  discover_assumptions?: boolean;
}

/**
 * Lift SV and decide `bad`-reachability of its assertions with the multi-engine
 * safety portfolio. Z3-/subprocess-heavy — uses the extended (`aiApiClient`, 120s)
 * client. The server host needs sv2v + Yosys.
 */
export const runSvVerify = async (
  request: SvVerifyRequest,
): Promise<Btor2VerifyResponse> => {
  const response = await aiApiClient.post<Btor2VerifyResponse>(
    "/sv/verify",
    request,
  );
  return response.data;
};

/** Lift SV and decide `AG(request → AF grant)` in one call. */
export const runSvVerifyLiveness = async (
  request: SvVerifyLivenessRequest,
): Promise<Btor2VerifyLivenessResponse> => {
  const response = await aiApiClient.post<Btor2VerifyLivenessResponse>(
    "/sv/verify-liveness",
    request,
  );
  return response.data;
};

/**
 * Lift SV and decide the conjunction `⋀ᵢ AG(aᵢ → AF bᵢ)` from `"ANTE => CONS"`
 * response pairs in one call. Reuses the {@link Btor2VerifyLivenessResponse} shape.
 */
export const runSvVerifyLivenessAll = async (
  request: SvVerifyLivenessAllRequest,
): Promise<Btor2VerifyLivenessResponse> => {
  const response = await aiApiClient.post<Btor2VerifyLivenessResponse>(
    "/sv/verify-liveness-all",
    request,
  );
  return response.data;
};

/** Lift SV and decide recoverability `AG EF target` in one call. */
export const runSvVerifyRecoverability = async (
  request: SvVerifyRecoverabilityRequest,
): Promise<Btor2VerifyRecoverabilityResponse> => {
  const response = await aiApiClient.post<Btor2VerifyRecoverabilityResponse>(
    "/sv/verify-recoverability",
    request,
  );
  return response.data;
};

/** Request for `POST /api/v1/sv/check-fsm` (SV-direct illegal-encoding scan). */
export interface SvCheckFsmRequest extends SvLiftFields {
  /** Max state-register width treated as an FSM (wider = datapath/counter, skipped). */
  max_width?: number;
}

/**
 * Lift SV and auto-scan every FSM register for a reachable illegal encoding in one
 * call — the SV-direct peer of {@link runBtor2CheckFsm}. Returns the same
 * {@link Btor2CheckFsmResponse}.
 */
export const runSvCheckFsm = async (
  request: SvCheckFsmRequest,
): Promise<Btor2CheckFsmResponse> => {
  const response = await aiApiClient.post<Btor2CheckFsmResponse>(
    "/sv/check-fsm",
    request,
  );
  return response.data;
};

/** Request for `POST /api/v1/sv/lint` (SV-direct structural preflight). */
export type SvLintRequest = SvLiftFields;

/**
 * Which `sv lint` check produced a finding.
 *
 * - `"undriven-partial-write"` — the register's partial-write lift reaches a
 *   free input, so a state predicate over it is *refused* by the verifier.
 * - `"registered-array-read-moving-address"` (mununu#496) — a registered array
 *   read (`q <= mem[a_q];`) whose address register can change in the same cycle
 *   its data is consumed, with no register recording the correspondence.
 */
export type SvLintRule =
  | "undriven-partial-write"
  | "registered-array-read-moving-address";

/**
 * One `sv lint` finding — a named signal a structural check flagged. Element of
 * {@link SvLintResponse}.
 */
export interface SvLintFinding {
  /** The offending signal's symbol (register name or a combinational output). */
  signal: string;
  /** `"register"` (the root register) | `"output"` (a downstream output of one). */
  kind: "register" | "output";
  /** Which check fired. */
  rule: SvLintRule;
  /**
   * Human-readable specifics — the address register and the fix, for the
   * array-read rule. Absent when the rule needs no elaboration.
   */
  detail?: string;
}

/** Response for `POST /api/v1/sv/lint`. */
export interface SvLintResponse {
  /** Number of named signals flagged (registers + downstream outputs). */
  signals_flagged: number;
  /** Number of the flagged signals that are state registers (the root findings). */
  registers_flagged: number;
  /** Per-signal findings (sorted by rule, then by name). */
  findings: SvLintFinding[];
}

/**
 * Lift SV and run the structural preflight checks — partial-write registers the
 * verifier cannot keep faithfully (monono#partsel) and registered array reads
 * against a moving address (mununu#496) — in ~lift cost with no model checking.
 * Read-only: changes no verdict. Surface peer of the CLI `mununu sv lint`.
 */
export const runSvLint = async (
  request: SvLintRequest,
): Promise<SvLintResponse> => {
  const response = await aiApiClient.post<SvLintResponse>("/sv/lint", request);
  return response.data;
};

/**
 * Request for `POST /api/v1/sv/mutate` (#468) — apply a NAMED structural mutation
 * and re-verify to check the property verdicts flip (property adequacy).
 */
export interface SvMutateRequest extends SvLiftFields {
  /** The mutation: `"stick:<reg>"` (freeze a register) or `"drop-reset:<reg>"`
   * (remove a register's reset arm). Required unless `list` is true. */
  mutation?: string;
  /** When true, ignore `mutation` and return the available mutation TARGETS. */
  list?: boolean;
  /** Engine selector (as verify-auto). Default `portfolio-sequential`. */
  engine?: string;
  /** Reset-gating (default true). */
  gate_reset?: boolean;
  /** Must-edge inference (`"smt-hyper-must"` for a recoverability drop-reset flip). */
  must_edge_inference?: string;
  /** mununu#475 item 4 — parity with `/sv/verify-auto`'s `params`. Override
   * module parameters before elaboration; each entry is `"NAME=VALUE"`
   * (top-module scope) or `"MODULE.NAME=VALUE"` (submodule scope; slang
   * applies it top-level by bare name). Shrinks a parameterised design so
   * its counters fit the bit-blast cap during the baseline + mutant
   * re-verify. A malformed entry is a HARD `BadRequest`. */
  params?: string[];
}

/** The available mutation targets (the `list` response payload). */
export interface SvMutateTargets {
  /** Every named register — a `stick:<reg>` target. */
  stick: string[];
  /** Every named register whose next is a reset mux — a `drop-reset:<reg>` target. */
  drop_reset: string[];
  /** Every named register compared against a constant — an `off-by-one:<reg>` target. */
  off_by_one: string[];
  /** Every named 1-bit signal — an `invert-cond:<sig>` target. */
  invert_cond: string[];
}

/** One property's baseline-vs-mutant verdict in a {@link SvMutateResponse}. */
export interface SvMutatePropertyFlip {
  /** The property (assertion) name. */
  name: string;
  /** Canonical verdict on the design as-lifted. */
  baseline: string;
  /** Canonical verdict on the mutated design. */
  mutant: string;
  /** `baseline != mutant` — the mutation was caught by this property. */
  flipped: boolean;
}

/** Response for `POST /api/v1/sv/mutate`. */
export interface SvMutateResponse {
  /** The applied mutation's label (null on a `list` request). */
  mutation: string | null;
  /** Available targets (present on a `list` request, null otherwise). */
  targets: SvMutateTargets | null;
  /** Per-property flips (empty on a `list` request). */
  properties: SvMutatePropertyFlip[];
  /** Count of properties the mutation flipped (caught it). */
  flipped: number;
  /** Count the mutation did NOT flip — the property-adequacy finding. */
  unflipped: number;
}

/**
 * Apply a NAMED structural mutation to a SystemVerilog design and re-verify,
 * checking that the property verdicts FLIP (mutation testing / property adequacy);
 * or (with `list`) enumerate the available mutation targets. A statement about the
 * PROPERTIES, never a bug report about the design. Surface peer of the CLI
 * `mununu sv mutate`.
 */
export const runSvMutate = async (
  request: SvMutateRequest,
): Promise<SvMutateResponse> => {
  const response = await aiApiClient.post<SvMutateResponse>(
    "/sv/mutate",
    request,
  );
  return response.data;
};

/**
 * cegar-extraction Stage 2 — SV-direct CEGAR request
 * (`POST /api/v1/sv/cegar`). Mirrors the CLI `mununu sv cegar`: the
 * backend lifts SystemVerilog to a flattened BTOR2 (sv2v + Yosys) and
 * runs the same refinement loop as `/btor2/cegar`, returning the same
 * {@link Btor2CegarResponse}. The CEGAR fields match {@link Btor2CegarRequest};
 * only the source half differs (SV + Yosys options instead of raw BTOR2).
 */
export interface SvCegarRequest {
  /** SystemVerilog primary source content. */
  source: string;
  /** Additional SV source files (packages / sub-modules / includes). */
  additional_sources?: { name: string; content: string }[];
  /** Top module name (Yosys auto-detects when omitted). */
  top?: string;
  /** Run sv2v before Yosys (modern SV). */
  use_sv2v?: boolean;
  /** Yosys `setundef -anyseq` (per-cycle havoc). */
  setundef_anyseq?: boolean;
  /** Yosys `setundef -anyconst` (constant power-up nondeterminism). */
  setundef_anyconst?: boolean;
  // --- CEGAR params (identical to Btor2CegarRequest) ---
  formula: string;
  predicates: PredicateSpecRequest[];
  controllable_inputs?: string[];
  predicate_source?: string;
  max_iterations?: number;
  must_edge_inference?: string;
  may_edge_inference?: string;
  config_values?: string[];
  emit_ctxdsl?: boolean;
}

/**
 * Run SV-direct CEGAR in one call: lift SV (sv2v + Yosys) → BTOR2 →
 * refinement loop. sv2v/Yosys/Z3-heavy — uses the extended
 * (`aiApiClient`, 120s) client.
 */
export const runSvCegar = async (
  request: SvCegarRequest,
): Promise<Btor2CegarResponse> => {
  const response = await aiApiClient.post<Btor2CegarResponse>(
    "/sv/cegar",
    request,
  );
  return response.data;
};

/** XL.6a — request for `POST /api/v1/sv/extract-sva`. slang parses SV directly,
 * so no top / sv2v / Yosys options are needed. */
export interface SvExtractSvaRequest {
  /** SystemVerilog primary source content. */
  source: string;
  /** Additional SV sources (packages / `include` targets — e.g. the standard
   * OpenTitan prim_assert macros). */
  additional_sources?: { name: string; content: string }[];
}

/** A successfully translated SVA assertion (mirrors the backend view). */
export interface TranslatedAssertionView {
  name: string;
  /** "assert" | "assume" | "cover". */
  kind: string;
  /** mu-calculus formula. */
  formula: string;
  /** XL.2 AG-EF recoverability companion — present only for covers. */
  recoverability_companion: string | null;
}

/** An assertion outside the supported Tier-1/Tier-2 fragment. */
export interface UnsupportedAssertionView {
  name: string;
  kind: string | null;
  reason: string;
}

/** A `__past` shadow register a translated formula needs (Tier-2 history). */
export interface ShadowSignalView {
  base: string;
  width: number;
  /** Deepest `$past` history depth synthesised for `base` (1 for the depth-1
   * family; `k` for `$past(base, k)`). Optional for backward compatibility. */
  depth?: number;
}

/** XL.6a — response for `POST /api/v1/sv/extract-sva`. */
export interface SvExtractSvaResponse {
  translated: TranslatedAssertionView[];
  unsupported: UnsupportedAssertionView[];
  required_shadows: ShadowSignalView[];
}

/**
 * Extract + translate a design's SVA to mu-calculus (the Track-H SVA
 * front-end). slang parses SV directly — fast + informational (no model
 * verification), so this uses the standard (`apiClient`, 10s) client. Surface
 * peer of the CLI `mununu sv extract-sva`.
 */
export const runSvExtractSva = async (
  request: SvExtractSvaRequest,
): Promise<SvExtractSvaResponse> => {
  const response = await apiClient.post<SvExtractSvaResponse>(
    "/sv/extract-sva",
    request,
  );
  return response.data;
};

/** XL.6b — request for `POST /api/v1/sv/verify-auto`. */
export interface SvVerifyAutoRequest {
  /** SystemVerilog primary source content. */
  source: string;
  /** Additional SV sources (packages / `include` targets). */
  additional_sources?: { name: string; content: string }[];
  /** Top module for the SV → BTOR2 lift (auto-detect when omitted). */
  top?: string;
  /** Run sv2v before Yosys (modern SV). */
  use_sv2v?: boolean;
  /** Force the slang RTL front-end (`read_slang`) for modern-SV constructs
   * yosys/sv2v reject. Requires the yosys-slang plugin server-side. Default `false`. */
  use_slang?: boolean;
  /** Module-parameter overrides applied via yosys `chparam -set` before the lift
   * (mirrors the CLI `--param`). Each entry is `"NAME=VALUE"` (applied to the top
   * module) or `"MODULE.NAME=VALUE"`. Shrinks a parameterised timing interval so
   * its counters get smaller, without a wrapper module. A parameter yosys cannot
   * apply is an ERROR (never silently dropped); verdicts are scoped to the applied
   * values (surfaced as a `parameter-override` note). Default empty. */
  params?: string[];
  /** Max CEGAR iterations per property (default 16). */
  max_iterations?: number;
  /** Must-edge inference per property (`"off"` default; `"smt-hyper-must"` for
   * sound νμ recoverability verdicts). */
  must_edge_inference?: string;
  /** Reset-gating: drop recognized `disable iff (reset)` guards and pin the
   * reset input inactive at the model level (default `true`). */
  gate_reset?: boolean;
  /** Auto-inject behavioral stubs for cut flop primitives (e.g. OpenTitan's
   * `prim_sparse_fsm_flop`) so the register survives the lift (default
   * `true`). */
  auto_stub_flops?: boolean;
  /** H.J.b — config concretization: pin wide config inputs to constants so
   * comparisons against them become decidable. Each entry `"signal=value"`
   * (e.g. `"cfg_detect_timer_i=7"`). Verdicts are then SCOPED to these values
   * (surfaced as a `config-concretization` note). Default empty. */
  config_values?: string[];
  /** H.H — counter upper bounds: seed a `signal <= value` cube-partition to
   * refine a counter-monotonicity property (`cnt_q >= $past(cnt_q)`) whose ⊥ is
   * caused by the abstract wraparound. Each entry `"signal<=value"` (the
   * `"signal=value"` spelling is also accepted). Sound (a partition, not an
   * assumption); needs `must_edge_inference` on. Bounds are also auto-derived
   * from `config_values`; a manual entry overrides the inferred one. Surfaced as
   * a `counter-bound` note. Default empty. */
  counter_bounds?: string[];
  /** Control-slice cut points, mirroring the CLI `--cutpoint`: net names to replace
   * with a free `$anyseq` input in the SV → BTOR2 lift (Yosys `cutpoint w:<net>`), so
   * the FSM's datapath guards drop out of the cone via cone-of-influence — the sound,
   * netlist-level way to fit the `"exact-symbolic"` engine on a wide control FSM. Each
   * entry is a bare net name (e.g. `"must_refresh"`). OVER-APPROXIMATION: a definite
   * HOLDS transfers (safety + over-approx); a definite VIOLATED is sound only when
   * guard-independent (an orphaned FSM state). Surfaced as a `control-slice` note.
   * Default empty. */
  cutpoint?: string[];
  /** Abstraction-predicate hints, mirroring the CLI `--predicate` and the in-source
   * `// @mununu_predicate <expr>` annotation (all three are merged). Each entry is a
   * predicate expression (`"reg == value"`, `"reg == reg"`, `"reg >= K"`) seeded as a
   * cube dimension for EVERY property, even when absent from the property formula.
   * Sound by monotonicity — a hint only refines the cube (a ⊥ can become definite; a
   * definite verdict never flips; an unclassifiable hint is dropped). Default empty. */
  predicate?: string[];
  /**
   * R-F5.5d — predicate-cube engine: `"explicit"` (default) or `"symbolic"`
   * (R-F5 BDD relation + CEGAR loop, no per-cube-pair SMT). Mirrors the CLI
   * `--engine`. The symbolic path handles moderate (≤ ~40-bit) designs in the
   * cube-dimension-predicate + bare `[]`/`<>` fragment; larger/wide designs +
   * derived predicates degrade to `Skipped` (they await the R-F5.6 COI work).
   */
  engine?: string;
  /** mununu#476 item 4 — disable antecedent shadow-register synthesis for
   * the exact-symbolic engine (default `false` ⇒ shadow-synth enabled, the
   * shipped behaviour). Set `true` to force the Phase A refusal for SVA
   * `|=>` properties whose antecedent combinationally reaches primary
   * inputs — differential-oracle / debug knob mirrored on the CLI as
   * `--no-antecedent-shadow` and via the process-global
   * `MUNUNU_NO_ANTECEDENT_SHADOW=1` env var. Per-request opt-out here is
   * thread-safe (unlike the env var). */
  no_antecedent_shadow?: boolean;
}

/** One register's concrete value in a counterexample state. */
export interface CexCellView {
  register: string;
  value: number;
}

/**
 * The exact engine's counterexample for a Violated property (`engine:
 * "exact-symbolic"`). Either a stall-lasso / trap-path — reset → `prefix` →
 * repeating `cycle` — witnessing a liveness/recoverability failure (`AF p` /
 * `AG AF p` / `AG EF p`), OR the A.4 unreachable-target witness for a bare `EF p`
 * (reachability): `unreachable_target` names the atoms the design never reaches,
 * with `prefix`/`cycle` empty (there is no trace — the target is simply unreachable).
 */
export interface CounterexampleView {
  prefix: CexCellView[][];
  cycle: CexCellView[][];
  /** A.4 — target atoms UNREACHABLE from reset (bare `EF p` violated); empty for lasso/trap witnesses. */
  unreachable_target?: string[];
}

/** One property's auto-verification verdict (mirrors the backend view). */
export interface PropertyVerdictView {
  name: string;
  /** "assert" | "assume" | "cover". */
  kind: string;
  formula: string;
  /** "holds" | "violated" | "unknown" | "skipped". */
  outcome: string;
  /** Cell-count detail (violated/unknown) or the skip reason. */
  detail: string | null;
  /** The cube predicates auto-seeded for this property (atom strings). */
  seeded_predicates: string[];
  /** D1.8b — a concrete stall-lasso counterexample (exact-symbolic engine). */
  counterexample?: CounterexampleView;
}

/** Model-level lift diagnostics for verify-auto. */
export interface ModelDiagnosticsView {
  /** Number of state register lines in the lifted model. */
  state_register_count: number;
  /**
   * Modules instantiated without a body, cut to free inputs (registers they
   * drive are not modeled as state). Empty for a self-contained design.
   */
  blackboxed_modules: string[];
  /**
   * Reset inputs pinned inactive at the model level (`"<signal>=<value>"`),
   * their `disable iff` guards dropped from the formulas. Empty when
   * reset-gating is off or no `disable iff` reset was recognized.
   */
  gated_resets: string[];
  /**
   * Cut flop-primitive modules for which a behavioral stub was auto-injected
   * so the register survives the lift (e.g. `prim_sparse_fsm_flop`).
   */
  auto_provided_stubs: string[];
}

/**
 * H.J — one provenance note: an abstraction/scoping decision that shaped the
 * verdicts (config concretization, reset-gating, cut modules, the may-over-approx
 * posture, the coverage summary), so a verdict's scope + caveats are explicit.
 */
export interface VerificationNoteView {
  /** Machine-stable kebab category, e.g. `"config-concretization"`. */
  kind: string;
  /** `"info"` | `"scope-caveat"` | `"soundness-caveat"`. */
  level: "info" | "scope-caveat" | "soundness-caveat";
  /** One-line human summary. */
  summary: string;
  /** Longer explanation (the why + the soundness/scope implication). */
  detail: string;
  /** Structured operands, e.g. `["cfg_detect_timer_i=7"]`. */
  items: string[];
}

/** XL.6b — response for `POST /api/v1/sv/verify-auto`. */
export interface SvVerifyAutoResponse {
  properties: PropertyVerdictView[];
  unsupported: UnsupportedAssertionView[];
  diagnostics: ModelDiagnosticsView;
  /** H.J — provenance notes (may be absent on older servers). */
  notes?: VerificationNoteView[];
}

/**
 * No-sidecar SVA verification: extract the design's SVA, lift, and verify each
 * property against the model. sv2v/Yosys/Z3/CEGAR-heavy (per property) — uses
 * the extended (`aiApiClient`, 120s) client. Surface peer of the CLI
 * `mununu sv verify-auto`.
 */
export const runSvVerifyAuto = async (
  request: SvVerifyAutoRequest,
): Promise<SvVerifyAutoResponse> => {
  const response = await aiApiClient.post<SvVerifyAutoResponse>(
    "/sv/verify-auto",
    request,
  );
  return response.data;
};

// Adapter format file extensions that require translation via the import endpoint
export const ADAPTER_EXTENSIONS = [
  "sv",
  "v",
  "json",
  "xstate",
  "tlsf",
  "aag",
  "aig",
  "btor",
  "btor2",
  "pml",
  "promela",
  "espec.json",
  "crewai.json",
  "crewai",
  "langgraph.json",
  "langgraph",
];

/**
 * Adapter format identifiers accepted by the /context/import endpoint.
 * Keep in sync with mununu-core's `auto_translate` and CLI dispatch.
 */
export const ADAPTER_FORMATS = [
  "auto",
  "tlsf",
  "aiger",
  "btor2",
  "promela",
  "xstate",
  "systemverilog",
  "sv-yosys",
  "extraction",
  "crewai",
  "langgraph",
] as const;
export type AdapterFormat = (typeof ADAPTER_FORMATS)[number];

/**
 * Download content as a file in the browser.
 */
export const downloadAsFile = (
  content: string,
  fileName: string,
  mimeType: string = "text/plain",
): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Export controller output format options.
 */
export type ControllerExportFormat = "ctxdsl" | "xstate" | "systemverilog";

export const EXPORT_FORMAT_EXTENSIONS: Record<ControllerExportFormat, string> =
  {
    ctxdsl: ".ctxdsl",
    xstate: ".json",
    systemverilog: ".sv",
  };

// Synthesis types (matches mununu backend /api/v1/context/synthesize)
type SynthesizeRequest =
  paths["/api/v1/context/synthesize"]["post"]["requestBody"]["content"]["application/json"];
type BaseSynthesizeResponse =
  paths["/api/v1/context/synthesize"]["post"]["responses"]["200"]["content"]["application/json"];

// Extend generated type with counterstrategy field added to the backend
export type SynthesizeResponse = BaseSynthesizeResponse & {
  counterstrategy?: CounterstrategyResult;
};

export type { SynthesizeRequest };

export interface LassoTrace {
  prefix: string[];
  cycle: string[];
  prefix_labels?: string[];
  cycle_labels?: string[];
}

// Synthesis endpoint
// Uses aiApiClient for extended timeout since synthesis can be slow
// Extraction endpoints

export interface DomainProfileInfo {
  name: string;
  language: string;
  description: string;
}

export interface ExtractionDomainsResponse {
  profiles: DomainProfileInfo[];
}

/** List available domain profiles for extraction. */
export const getExtractionDomains =
  async (): Promise<ExtractionDomainsResponse> => {
    const response = await apiClient.get<ExtractionDomainsResponse>(
      "/extraction/domains",
    );
    return response.data;
  };

/** Request for AST-based extraction from source code. */
export interface ExtractionExtractRequest {
  config: string;
  source: string;
  language?: string;
}

/** Response from AST-based extraction. */
export interface ExtractionExtractResponse {
  success: boolean;
  espec: string;
  warnings: string[];
  automata: { id: string; state_count: number; transition_count: number }[];
}

/**
 * Phase B — concurrency-idiom finding produced by `proposeComposition`.
 * Mirrors the Rust `DetectedConcurrency` struct. Each finding is
 * suggestion-grade; the caller reviews before promoting it into a
 * `composition.instances[]` block.
 */
export interface DetectedConcurrency {
  /** Identifier of the detector (e.g., `python_asyncio_gather`). */
  detector_id: string;
  /** Short human-readable description of the finding. */
  description: string;
  /** Source line of the detected call (1-indexed). */
  line: number;
  /** Number of parallel branches detected, when known. */
  branch_count: number | null;
  /** Suggested instance names for the proposed composition. */
  suggested_instance_names: string[];
  /** Class name hint, when the detector could infer one. */
  suggested_class_hint: string | null;
}

export interface ProposeCompositionRequest {
  source: string;
  language: string;
}

export interface ProposeCompositionResponse {
  findings: DetectedConcurrency[];
}

/**
 * Scan source for concurrency idioms and return per-call-site
 * suggestions for a `composition.instances[]` block. Pre-pass for
 * the `compose` workflow step — caller decides whether to apply.
 *
 * Uses a 30s per-request timeout (override of apiClient's 10s
 * default). The detector is fast in release builds, but tree-sitter
 * parsing on larger sources (or dev/debug backends) can exceed 10s
 * — surfacing as ECONNABORTED on the client. 30s covers both cases
 * without falling all the way back to aiApiClient's 120s, which is
 * reserved for genuinely heavy operations (synthesis,
 * counterstrategy).
 */
export const proposeComposition = async (
  request: ProposeCompositionRequest,
): Promise<ProposeCompositionResponse> => {
  const response = await apiClient.post<ProposeCompositionResponse>(
    "/extraction/propose-composition",
    request,
    { timeout: 30000 },
  );
  return response.data;
};

/** Extract a model from source code using the AST-based pipeline. */
export const extractSource = async (
  request: ExtractionExtractRequest,
): Promise<ExtractionExtractResponse> => {
  const response = await apiClient.post<ExtractionExtractResponse>(
    "/extraction/extract",
    request,
  );
  return response.data;
};

export const synthesizeContext = async (
  request: SynthesizeRequest,
): Promise<SynthesizeResponse> => {
  const response = await aiApiClient.post<SynthesizeResponse>(
    "/context/synthesize",
    request,
  );
  return response.data;
};

// ============================================================================
// GR(1) Synthesis Endpoint (sound reactive controller synthesis)
// ============================================================================

/** Request for sound GR(1) controller synthesis (POST /api/v1/synth/gr1). */
export interface Gr1SynthesizeRequest {
  /** The source spec (TLSF today). */
  context: { name: string; content: string };
  /** Adapter to interpret the source (defaults to "tlsf"). */
  adapter?: string;
  /** Module name for the emitted controller (defaults to "gr1_controller"). */
  module?: string;
}

/** Response from GR(1) controller synthesis. */
export interface Gr1SynthesizeResponse {
  /** Whether the spec is realizable (sound GR(1) verdict). */
  realizable: boolean;
  /** The synthesized controller as SystemVerilog, when realizable. */
  controller_sv?: string;
  /** Number of game states (env + ctrl + BAD). */
  game_states: number;
  /** Number of monitor bits in the game state. */
  monitor_bits: number;
  /** Human-readable notes (e.g. unsupported multi-guarantee memory). */
  notes: string[];
}

/**
 * Sound GR(1) controller synthesis from an LTL assume/guarantee spec.
 *
 * Unlike {@link synthesizeContext} (signature-based extraction over the combined
 * μ-calculus formula, unsound for conjunctive safety+liveness objectives), this
 * runs the sound GR(1) pipeline (`ControllerMode::Gr1`): the safety guarantees
 * constrain the game arena rather than being intersected as denotational
 * conjuncts. Returns the realizability verdict and, when realizable, the
 * controller SystemVerilog. Uses the extended-timeout client since synthesis
 * can be slow.
 */
export const synthesizeGr1 = async (
  request: Gr1SynthesizeRequest,
): Promise<Gr1SynthesizeResponse> => {
  const response = await aiApiClient.post<Gr1SynthesizeResponse>(
    "/synth/gr1",
    request,
  );
  return response.data;
};

// ============================================================================
// Extraction Validate Endpoint
// ============================================================================

export interface ExtractionValidateRequest {
  spec: string;
  source: string;
  drift_window?: number;
}

export interface ValidationSummary {
  total: number;
  exact: number;
  drifted: number;
  mismatch: number;
  error: number;
  uncovered_accesses: number;
}

export interface AnchorResult {
  id: string;
  section: string;
  status: "exact" | "drifted" | "mismatch" | "error";
  line: number | null;
  found_line: number | null;
  message: string | null;
}

export interface UncoveredAccess {
  line: number;
  field: string;
  content: string;
}

export interface ExtractionValidateResponse {
  success: boolean;
  summary: ValidationSummary;
  anchors: AnchorResult[];
  uncovered: UncoveredAccess[];
  commit_match: boolean | null;
}

/** Validate extraction spec line anchors against source code. */
export const validateExtraction = async (
  request: ExtractionValidateRequest,
): Promise<ExtractionValidateResponse> => {
  const response = await apiClient.post<ExtractionValidateResponse>(
    "/extraction/validate",
    request,
  );
  return response.data;
};

// ============================================================================
// Context Predicates Endpoint
// ============================================================================

export interface ContextPredicatesRequest {
  context: { name: string; content: string };
  sidecars?: { name: string; content: string }[];
  automaton?: string;
}

export interface ContextPredicatesResponse {
  success: boolean;
  predicates: Record<string, string[]>;
}

/** List guard predicates per automaton. */
export const getContextPredicates = async (
  request: ContextPredicatesRequest,
): Promise<ContextPredicatesResponse> => {
  const response = await apiClient.post<ContextPredicatesResponse>(
    "/context/predicates",
    request,
  );
  return response.data;
};

// ============================================================================
// Contract Validate Endpoint (Document A §3.x discharge check)
// ============================================================================

export type ContractClauseKind = "assumption" | "guarantee" | "invariant";

export type ContractClauseProvenance =
  | "user_authored"
  | { corpus: { id: string } }
  | "source_comment"
  | "mununu_proposed"
  | "vendor_contract"
  | "unknown";

export interface ContractClause {
  id: string;
  kind: ContractClauseKind;
  owner: string;
  description?: string | null;
  provenance?: ContractClauseProvenance;
  /** Optional mu-calculus rank used by the lightweight McMillan check. */
  mu_rank?: number | null;
}

export interface DischargeEdge {
  discharger: string;
  dischargee: string;
}

export interface ContractSet {
  clauses: ContractClause[];
  discharges: DischargeEdge[];
  environment_assumptions: string[];
}

export interface RankWitnessedCycle {
  cycle: string[];
  base_edge: [string, string];
}

export type DischargeVerdict =
  | {
      kind: "acyclic";
      topological: string[];
      unmet_environment: string[];
    }
  | {
      kind: "circular_with_rank_witness";
      cycles: RankWitnessedCycle[];
      acyclic_remainder: string[];
    }
  | {
      kind: "circular";
      cycles: string[][];
      acyclic_remainder: string[];
    }
  | {
      kind: "potentially_circular";
      unresolved: string[];
      partial: DischargeVerdict;
    }
  | {
      kind: "unmet";
      missing_dischargers: string[];
      partial: DischargeVerdict;
    };

// ============================================================================
// Contract Discover Endpoint (Document A §A5 phase 1)
// ============================================================================

export type BoundaryDirection = "Input" | "Output" | "Inout" | "Internal";

export interface PortDescriptor {
  name: string;
  direction: BoundaryDirection;
  description?: string | null;
}

/**
 * Recognised `@mununu_*` tag from the §D.5 source-comment annotation
 * grammar. Sent back from the server as part of `BlackBoxInterface`
 * so the UI can show vendor-declared assumptions / guarantees /
 * interface URIs without round-tripping through CTXDSL.
 */
export type MununuTag =
  | "blackbox"
  | "assume"
  | "guarantee"
  | "interface"
  | "controllable"
  | "uncontrollable";

export interface MununuAnnotation {
  tag: MununuTag;
  value: string;
  source_line?: number | null;
}

export interface BlackBoxInterface {
  name: string;
  ports: PortDescriptor[];
  source_file?: string | null;
  source_line?: number | null;
  /** Source-comment annotations attached to this module (D §D.5). */
  annotations?: MununuAnnotation[];
}

export interface InterfaceLabel {
  name: string;
  controllability: "Controllable" | "Internal" | "Uncontrollable";
  direction: BoundaryDirection;
  description: string | null;
}

export type GapKind =
  | "output_sequencing"
  | "latency_bound"
  | "input_assumption"
  | "state_predicate"
  | "fairness"
  | "other";

export interface SourceLocation {
  file: string;
  line: number;
}

export interface GapMarker {
  module: string;
  kind: GapKind;
  labels: string[];
  description?: string | null;
  source_location?: SourceLocation | null;
}

/**
 * Parsed shape of a `contract://<domain>/<name>[@<version>][?alt=<id>]`
 * URI carried on an `@mununu_interface` annotation.
 */
export interface ContractUri {
  domain: string;
  name: string;
  version?: string | null;
  alternative?: string | null;
  raw: string;
}

export type ResolutionStatus =
  | "resolved"
  | "not_found"
  | "no_corpus"
  | "malformed"
  | "sidecar_reference";

/**
 * Outcome of resolving a single `@mununu_interface contract://` URI
 * against the supplied corpus during phase-2 discovery.
 */
export interface CorpusResolution {
  raw_uri: string;
  parsed: ContractUri;
  status: ResolutionStatus;
  matched_ids: string[];
  alternative_matched?: boolean | null;
}

export interface GapMarkerReport {
  markers: GapMarker[];
}

export interface Phase1Output {
  module: string;
  labels: InterfaceLabel[];
  gaps: GapMarkerReport;
  /**
   * Outcomes of resolving each `@mununu_interface contract://` URI on
   * the interface against the corpus supplied via
   * `ContractDiscoverRequest.corpus`. Empty when no URIs were present
   * or when no corpus was supplied.
   */
  corpus_resolutions?: CorpusResolution[];
}

export interface ContractDiscoverRequest {
  interface: BlackBoxInterface;
  force_controllable?: string[];
  force_uncontrollable?: string[];
  emit_fairness_gap?: boolean;
  /**
   * Filesystem path of the contract corpus root the server should load
   * for resolving `@mununu_interface contract://` URIs. Mirrors the CLI
   * `--corpus <DIR>` flag for three-surface parity.
   */
  corpus?: string;
}

// ============================================================================
// Contract Query Endpoint (Document D §D.2 — corpus lookup)
// ============================================================================

/** Origin of a corpus entry — drives the ranker's trust tier. */
export type CorpusProvenance =
  | { tier: "mununu_verified"; verified_against?: string | null }
  | { tier: "vendor"; name: string; license?: string | null }
  | { tier: "community"; contributors?: string[] };

/** A named alternative within a contract entry. */
export interface ContractAlternative {
  id: string;
  label: string;
  description?: string | null;
}

/** One ranked candidate from a corpus query. */
export interface ContractEntry {
  id: string;
  version: string;
  domain: string;
  name: string;
  description?: string | null;
  parameters?: Record<string, unknown>;
  contract?: unknown;
  alternatives?: ContractAlternative[];
  provenance: CorpusProvenance;
  soundness_flag?: string | null;
}

export interface ContractQueryRequest {
  /** `<domain>/<name>` identifier, e.g. `"rtl_protocol/axi4_slave"`. */
  id: string;
  /** Filesystem path of the corpus root the server should load. */
  corpus: string;
  /** Parameters to match against entries. */
  parameters?: Record<string, unknown>;
}

export interface ContractQueryResponse {
  candidates: ContractEntry[];
}

// ============================================================================
// Contract Review Endpoint (Document A §A7 / Document D §D.8) — HITL stage 4
// ============================================================================

/**
 * Where a proposed clause came from. `SourceComment` carries the
 * canonical tag (e.g. `"guarantee"`) and optional 1-based source line;
 * `Corpus` carries the resolved entry id + optional alternative.
 */
export type ProposalProvenance =
  | { source: "source_comment"; tag: string; source_line?: number | null }
  | {
      source: "corpus";
      entry_id: string;
      alternative?: string | null;
    };

/**
 * One proposed clause surfaced for HITL review. Kinds today:
 * `"assumption" | "guarantee" | "invariant" | "reference"`. `reference`
 * is the special-case used for a `Resolved` corpus entry whose body
 * has not yet been unpacked into concrete clauses.
 */
export interface ProposedClause {
  id: string;
  kind: string;
  owner: string;
  description?: string | null;
  provenance: ProposalProvenance;
  soundness_note?: string | null;
}

export interface ReviewPackage {
  module: string;
  phase1: Phase1Output;
  proposed_clauses: ProposedClause[];
}

export interface ContractReviewRequest {
  interface: BlackBoxInterface;
  force_controllable?: string[];
  force_uncontrollable?: string[];
  emit_fairness_gap?: boolean;
  /** Optional corpus root used to resolve `@mununu_interface` URIs. */
  corpus?: string;
}

/**
 * Build a HITL stage-4 review package — phase-2 discovery output plus
 * the flat list of proposed clauses extracted from annotations and
 * resolved corpus references.
 */
export const reviewContract = async (
  request: ContractReviewRequest,
): Promise<ReviewPackage> => {
  const response = await apiClient.post<ReviewPackage>(
    "/contract/review",
    request,
  );
  return response.data;
};

/**
 * Look up matching entries in the contract corpus (Document D §D.2).
 * Returns the ranked candidate list (full parameter-match first, then
 * provenance trust tier, then version descending).
 */
export const queryCorpus = async (
  request: ContractQueryRequest,
): Promise<ContractQueryResponse> => {
  const response = await apiClient.post<ContractQueryResponse>(
    "/contract/query",
    request,
  );
  return response.data;
};

/**
 * Run phase-1 contract discovery (Document A task A5) on a black-box
 * interface description. Returns labels with controllability + gap
 * markers.
 */
export const discoverContract = async (
  request: ContractDiscoverRequest,
): Promise<Phase1Output> => {
  const response = await apiClient.post<Phase1Output>(
    "/contract/discover",
    request,
  );
  return response.data;
};

/**
 * Validate a contract set's discharge graph (Document A §3.x).
 *
 * Returns the SCC verdict (acyclic / circular / potentially-circular / unmet).
 * Cheap mechanical check; uses the standard `apiClient` (10s timeout).
 */
export const validateContract = async (
  set: ContractSet,
): Promise<DischargeVerdict> => {
  const response = await apiClient.post<DischargeVerdict>(
    "/contract/validate",
    set,
  );
  return response.data;
};

// ============================================================================
// Codesign Verify Endpoint (Document C task C4) — HW/SW codesign
// ============================================================================

/** Direction of a register relative to firmware. */
export type RegisterDirection = "RW" | "RO" | "WO";

/** Standard concurrency-semantics classes (Doc C §C.2). */
export type VisibilityClass =
  | "control"
  | "status"
  | "data"
  | "interrupt_flag"
  | "clear_on_read"
  | "other";

/** How firmware reaches the register (Doc C §C.2). */
export type AccessPath = "mmio_direct" | "mmio_bridge" | "dma";

/** A single bit-field inside a register. */
export interface RegisterField {
  name: string;
  bits: [number, number];
  sv_signal?: string | null;
  c_accessor?: string | null;
  description?: string | null;
}

/** A single memory-mapped register. */
export interface Register {
  name: string;
  offset: number;
  width_bits: number;
  direction: RegisterDirection;
  visibility_class?: VisibilityClass;
  access_path?: AccessPath;
  fields?: RegisterField[];
  description?: string | null;
}

/** Top-level register-map sidecar (Document C task C1 schema). */
export interface RegisterMap {
  peripheral: string;
  base_address: string;
  registers: Register[];
  description?: string | null;
  contract_uri?: string | null;
}

/** Composition shape report from `POST /api/v1/codesign/verify`. */
export interface CodesignCompositionInfo {
  peripheral_automaton: string;
  composition_name: string;
  firmware_members: string[];
  automaton: string;
}

export interface CodesignVerifyRequest {
  /** Parsed register-map sidecar. */
  register_map: RegisterMap;
  /** Firmware CTXDSL document text. */
  firmware_ctxdsl: string;
  /** Formula name to evaluate (declared in `firmware_ctxdsl`). */
  formula: string;
  /** Composition or automaton to evaluate over (default:
   *  `<PERIPHERAL>System`). */
  automaton?: string;
  /** Override the peripheral automaton name. */
  peripheral_automaton?: string;
  /** Override the composition name. */
  composition_name?: string;
}

export interface CodesignVerifyResponse {
  /** Whether every initial state satisfies the formula. */
  satisfied: boolean;
  total_states: number;
  satisfying_states: number;
  initial_states: string[];
  initial_satisfying: string[];
  composition: CodesignCompositionInfo;
  /** The full composed CTXDSL — useful for the UI to render
   *  alongside the verdict. */
  composed_ctxdsl: string;
}

/**
 * HW/SW codesign verification entry point (Document C task C4).
 *
 * Splices the register-map sidecar into a hand-authored firmware
 * CTXDSL, realises the composed context, and evaluates the named
 * formula. Returns the verdict + composition shape + composed CTXDSL.
 */
export const verifyCodesign = async (
  request: CodesignVerifyRequest,
): Promise<CodesignVerifyResponse> => {
  const response = await apiClient.post<CodesignVerifyResponse>(
    "/codesign/verify",
    request,
  );
  return response.data;
};

// ---------------------------------------------------------------------------
// Verify framework (general N-source) — POST /api/v1/verify
// ---------------------------------------------------------------------------

/** One `[[sources]]` entry inside a parsed verify.toml. */
export interface VerifySource {
  id: string;
  adapter: string;
  files: string[];
  options?: Record<string, unknown>;
}

/** `[alphabet]` block. Optional fields apply per strategy. */
export interface VerifyAlphabet {
  strategy: "direct" | "renamings" | "register_map";
  renamings?: Array<{ from: string; to: string }>;
  register_map?: string;
  allow_peripheral_superset?: boolean;
}

/** `[composition]` block. */
export interface VerifyComposition {
  semantics: "synchronous" | "asynchronous" | "superset";
  members: string[];
  name?: string;
}

/** One `[[properties]]` entry. */
export interface VerifyProperty {
  name: string;
  template?: string;
  formula?: string;
  args?: Record<string, string>;
  over?: string;
  /**
   * mununu#595 — names of `[[assumptions]]` this property is verified UNDER.
   * Only the fairness templates (`fair_response`, `fair_always_eventually`)
   * take assumptions, and they require at least one.
   */
  assumptions?: string[];
}

/**
 * mununu#595 — one `[[assumptions]]` entry: a named environment assumption
 * (fairness constraint) every considered path must satisfy infinitely often.
 * Mirrors `verify::config::AssumptionSection`.
 */
export interface VerifyAssumption {
  name: string;
  /** `"state"` (GF P) | `"edge"` (GF ⟨l⟩) | `"edges"` (any of `labels`) | `"weak"` (weak fairness of l). */
  kind: "state" | "edge" | "edges" | "weak";
  /** The state predicate (`state`) or the label (`edge`, `weak`). */
  atom?: string;
  /** The labels (`edges`). */
  labels?: string[];
}

/** Parsed verify.toml payload. Mirrors `verify::config::VerifyConfig`. */
export interface VerifyConfig {
  project: { name: string; description?: string };
  sources: VerifySource[];
  alphabet?: VerifyAlphabet;
  composition: VerifyComposition;
  properties?: VerifyProperty[];
  /** mununu#595 — `[[assumptions]]`, referenced by name from `properties[].assumptions`. */
  assumptions?: VerifyAssumption[];
  /** mununu#594 — the counterexample step cap (default 20 on the backend). */
  counterexample_max_steps?: number;
}

/**
 * Request body for `POST /api/v1/verify`.
 *
 * Supply exactly one of `config` (pre-parsed) or `config_toml` (raw
 * verify.toml text the backend parses for you). The latter avoids a
 * client-side TOML parser dependency.
 */
export interface VerifyProjectRequest {
  /** Pre-parsed verify.toml payload. Mutually exclusive with `config_toml`. */
  config?: VerifyConfig;
  /** Raw verify.toml text. Mutually exclusive with `config`. */
  config_toml?: string;
  /** Directory the source paths in the config resolve against. */
  base_dir: string;
  /**
   * R4W-3 (R.4 clustered-COI) — Jaccard similarity floor for the
   * clustered cone-of-influence comparison the BTOR2 (`sv-yosys`) route
   * reports per source. Overrides any `cluster_similarity_floor` in the
   * supplied config / config_toml. Omitted → the backend's recommended
   * `0.5`. Tighter (→ 1.0) approaches per-property COI; looser (→ 0.0)
   * collapses toward joint COI.
   */
  cluster_similarity_floor?: number;
}

/**
 * R4W-3 — one cluster's entry in a {@link VerifyClusterCoiReport}.
 * Mirrors `adapter::partition::coi::ClusterCoiEntry`.
 */
export interface VerifyClusterCoiEntry {
  /** Property names merged into this cluster. */
  members: string[];
  /** Signal count in this cluster's cone (its members' cone union). */
  cone_size: number;
}

/**
 * R4W-3 — joint-vs-clustered cone comparison the BTOR2 bit-blaster
 * reports per source. Mirrors `adapter::partition::coi::ClusterCoiReport`.
 * Clustering helps exactly when `max_cluster_cone_size < joint_cone_size`.
 */
export interface VerifyClusterCoiReport {
  /** Signals a naive joint COI over all properties would keep. */
  joint_cone_size: number;
  /** Per-cluster entries (deterministic input order). */
  clusters: VerifyClusterCoiEntry[];
  /** Largest per-cluster cone — bounds independent per-cluster analysis. */
  max_cluster_cone_size: number;
}

/**
 * R4W-3 — per-source partition telemetry. Mirrors
 * `adapter::partition::PartitionSummary`. `cluster_coi` is present only
 * when the source ran the BTOR2 route with declared properties.
 */
export interface VerifyPartitionSummary {
  total_signals: number;
  kept: number;
  dropped_coi: number;
  datapath_uf: number;
  state_bits_before: number | null;
  state_bits_after: number | null;
  cluster_coi?: VerifyClusterCoiReport;
  /**
   * R46-4 (R.4.6) — per-cluster verification routing. Present ONLY when
   * the joint design busted the backend state-bit cap and per-cluster
   * verification kicked in: maps each property name to the cluster
   * automaton (`Circuit__cl0`, …) its verdict was evaluated over. Absent
   * on the joint path. Mirrors `PartitionSummary::cluster_routing`.
   */
  cluster_routing?: Record<string, string>;
}

/** Per-source diagnostic in the verify report. */
export interface VerifySourceSummary {
  id: string;
  adapter: string;
  automaton: string | null;
  /** R4W-3 — partition / clustered-COI telemetry (BTOR2 route). */
  partition_summary?: VerifyPartitionSummary;
}

/** Composition shape used for evaluation. */
export interface VerifyCompositionInfo {
  semantics: string;
  name: string;
  members: string[];
}

/** How a property's formula was sourced. */
export type VerifyPropertyFormulaSource =
  | { kind: "inline" }
  | { kind: "template"; id: string; args: Record<string, string> };

/** One step inside a `VerifyTraceWitness`. */
export interface VerifyTraceStep {
  /** Label payload of the fired transition (comma-joined when multi-label). */
  label: string;
  /** Composed-state name entered after firing this transition. */
  successor_state: string;
}

/** Reason a `VerifyTraceWitness` stopped at a particular step. */
export type VerifyTraceTermination =
  | { kind: "sink" }
  | { kind: "cycle"; return_to_step: number }
  | { kind: "length_limit" };

/**
 * Forward-walk witness from a violating initial state, attached to a
 * `VerifyPropertyVerdict` when the verdict is unsatisfied. Mirrors
 * `mununu_core::verify::report::TraceWitness`.
 */
export interface VerifyTraceWitness {
  initial_state: string;
  steps: VerifyTraceStep[];
  termination: VerifyTraceTermination;
  /**
   * mununu#594 — on the safety shape (`nu X. (phi && [] X)`), the `!phi`
   * state the shortest path leads to, named even when the printed steps
   * were cut at the cap.
   */
  violating_state?: string;
}

/** Per-property verdict. */
export interface VerifyPropertyVerdict {
  name: string;
  formula_source: VerifyPropertyFormulaSource;
  formula: string;
  over: string;
  satisfied: boolean;
  total_states: number;
  satisfying_states: number;
  initial_states: string[];
  initial_satisfying: string[];
  /**
   * IR-track P3.1 — 3-valued { T, F, ⊥ } summary over the initial states.
   * Same shape as the cegar `CegarVerdictSummary` (reuses the `Trit`
   * renderer). On the bit-blast verify path `unknown_cells` is 0 and this
   * mirrors `satisfied`; the predicate-cube path (P3.3) populates ⊥.
   * Optional for back-compat with pre-P3 reports.
   */
  initial_verdict_summary?: {
    true_cells: number;
    false_cells: number;
    unknown_cells: number;
  };
  /** Present only when `satisfied === false` and a witness was constructible. */
  counterexample?: VerifyTraceWitness;
  /**
   * mununu#595 — the `[[assumptions]]` this verdict is CONDITIONAL on (by
   * name). Absent / empty for an unconditional property. Non-empty means
   * `satisfied` reads "holds under these assumptions", never a bare "holds".
   */
  assumptions?: string[];
  /**
   * mununu#595 — the non-vacuity gate for a conditional verdict: a fair
   * path (satisfying every assumption infinitely often) exists from every
   * initial state. `false` = the assumptions are unsatisfiable and the
   * property is VACUOUS — `satisfied` is then true for no reason. Absent
   * for an unconditional property.
   */
  fair_path_exists?: boolean;
}

/** Top-level report from `POST /api/v1/verify`. */
/**
 * One `btor2`-source safety-cube (`AG !bad`) verdict from the opt-in
 * `safety_cube` orchestrator pass. Populated only when the project's
 * `verify.toml` sets `safety_cube = true`; the cube (enumeration +
 * emergent-K interpolation discovery) runs on each `btor2` source that
 * carries a `bad` obligation. Mirrors the Rust
 * `crate::verify::report::SafetyCubeResult`.
 */
export interface VerifySafetyCubeResult {
  source_id: string;
  file: string;
  /**
   * SVA assertion name for an `sv-yosys` source (slang-extracted); absent for a
   * `btor2` source (a single anonymous `bad` obligation).
   */
  property?: string;
  /** "holds" | "violated" | "unknown" | "skipped". */
  verdict: string;
}

export interface VerifyReport {
  project: string;
  sources: VerifySourceSummary[];
  composition: VerifyCompositionInfo;
  property_verdicts: VerifyPropertyVerdict[];
  /**
   * Per-source safety-cube results — present only when `safety_cube = true`
   * in the project config; omitted (or empty) otherwise.
   */
  safety_cube_results?: VerifySafetyCubeResult[];
}

/**
 * General N-source verification entry point. Mirrors `mununu verify` (CLI).
 *
 * Dispatches each source through its adapter, applies the alphabet
 * binding, assembles a unified CTXDSL document, and evaluates every
 * declared property. Returns the structured `VerifyReport`. Uses the
 * 120-second client because the orchestrator can run multiple
 * adapters + LLVM extraction + property evaluation in a single call.
 */
export const verifyProject = async (
  request: VerifyProjectRequest,
): Promise<VerifyReport> => {
  const response = await aiApiClient.post<VerifyReport>("/verify", request);
  return response.data;
};

// ---------------------------------------------------------------------------
// Memory-check (B2b) — POST /api/v1/verify/memory-check
// ---------------------------------------------------------------------------

/** Per-source posture summary from the memory-check report. */
export interface MemoryPostureSummary {
  source_id: string;
  kind: string;
  tracked: string[];
  value_symbol_set: string[];
  fence_semantics?: string | null;
  notes?: string | null;
}

/**
 * Memory-check warning. The `kind` discriminator matches the
 * server's `serde(rename_all = "snake_case")` tag.
 */
export type MemoryCheckWarning =
  | {
      kind: "chaotic_posture_referenced";
      property_name: string;
      source_id: string;
      reference: string;
    }
  | {
      kind: "value_mention_on_tracked_addresses_posture";
      property_name: string;
      source_id: string;
      reference: string;
    }
  | {
      kind: "untracked_address_referenced";
      property_name: string;
      source_id: string;
      address: string;
    }
  | {
      kind: "undeclared_value_symbol_referenced";
      property_name: string;
      source_id: string;
      address: string;
      symbol: string;
    };

/** Memory-check informational note (currently: RVWMO aspirational). */
export type MemoryCheckInfo = {
  kind: "rvwmo_aspirational";
  source_id: string;
};

/** Top-level report from `POST /api/v1/verify/memory-check`. */
export interface MemoryCheckReport {
  postures: MemoryPostureSummary[];
  undeclared_sources: string[];
  warnings: MemoryCheckWarning[];
  info: MemoryCheckInfo[];
}

/** Request body for `POST /api/v1/verify/memory-check`. */
export interface MemoryCheckRequest {
  /** Pre-parsed verify.toml payload. Mutually exclusive with `config_toml`. */
  config?: VerifyConfig;
  /** Raw verify.toml text. Mutually exclusive with `config`. */
  config_toml?: string;
}

/**
 * Run the memory-soundness analysis on a parsed verify.toml.
 * Mirrors `mununu memory check` (CLI). Pure inspection — no source
 * files read — so the 10-second client is appropriate.
 */
export const verifyMemoryCheck = async (
  request: MemoryCheckRequest,
): Promise<MemoryCheckReport> => {
  const response = await apiClient.post<MemoryCheckReport>(
    "/verify/memory-check",
    request,
  );
  return response.data;
};
