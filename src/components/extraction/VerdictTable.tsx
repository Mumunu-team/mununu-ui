/**
 * VerdictTable — renders the property verdicts from a verify-framework
 * `VerifyReport`. Used by the `verify-project` workflow's verify step.
 *
 * Stays intentionally minimal: one row per property, with verdict,
 * over-target, formula source kind, and a state-count summary
 * (`satisfying / total`). The full formula text is shown collapsed
 * and revealed via a per-row toggle since some inline formulas can
 * span multiple lines.
 */

import { useState } from "react";
import type {
  VerifyReport,
  VerifyPropertyVerdict,
  VerifySourceSummary,
} from "../../api/endpoints";
import { CounterexampleTrace } from "./CounterexampleTrace";
import { Trit } from "./CegarTraceView";
import { useI18n } from "../../hooks/useI18n";

interface VerdictTableProps {
  report: VerifyReport;
}

export function VerdictTable({ report }: VerdictTableProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Header report={report} />
      <ClusterCoiSummary sources={report.sources} />
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800/50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              {t("extraction.verdictTable.columnProperty")}
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              {t("extraction.verdictTable.columnVerdict")}
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              {t("extraction.verdictTable.columnOver")}
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              {t("extraction.verdictTable.columnSource")}
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-400">
              {t("extraction.verdictTable.columnStates")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {report.property_verdicts.map((v) => (
            <VerdictRow key={v.name} verdict={v} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Header({ report }: { report: VerifyReport }) {
  const { t } = useI18n();
  // mununu#595 — a VACUOUS conditional verdict (assumptions admit no fair
  // path) is not a satisfied property, whatever `satisfied` says.
  const satisfied = report.property_verdicts.filter(
    (v) => v.satisfied && v.fair_path_exists !== false,
  ).length;
  const total = report.property_verdicts.length;
  return (
    <div className="space-y-1">
      <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {report.project}
      </h4>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
        <span>
          <span className="font-medium">{satisfied}</span> /{" "}
          <span className="font-medium">{total}</span>{" "}
          {t("extraction.verdictTable.propertiesSatisfied")}
        </span>
        <span>·</span>
        <span>
          {t("extraction.verdictTable.compositionLabel")}{" "}
          <span className="font-mono">{report.composition.semantics}</span>{" "}
          <span className="font-mono">{report.composition.name}</span>
        </span>
        <span>·</span>
        <span>
          {t("extraction.verdictTable.membersLabel")}{" "}
          <span className="font-mono">
            {report.composition.members.join(", ")}
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * R4W-3 (R.4 clustered-COI) — per-source joint-vs-clustered cone
 * comparison. Rendered only for sources whose backend partition summary
 * carries a `cluster_coi` report (the BTOR2 / `sv-yosys` route with
 * declared properties); other sources contribute nothing, so the whole
 * block is hidden when none apply.
 */
function ClusterCoiSummary({ sources }: { sources: VerifySourceSummary[] }) {
  const { t } = useI18n();
  const withClusterCoi = sources.filter(
    (s) => s.partition_summary?.cluster_coi,
  );
  if (withClusterCoi.length === 0) {
    return null;
  }
  return (
    <div className="space-y-1 rounded border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-800/30">
      <div className="font-medium text-gray-700 dark:text-gray-300">
        {t("extraction.verdictTable.clusterCoiTitle")}
      </div>
      {withClusterCoi.map((s) => {
        const cc = s.partition_summary!.cluster_coi!;
        const reduced = cc.max_cluster_cone_size < cc.joint_cone_size;
        return (
          <div
            key={s.id}
            className="flex flex-wrap items-center gap-x-2 text-gray-600 dark:text-gray-400"
          >
            <span className="font-mono">{s.id}</span>
            <span>
              {t("extraction.verdictTable.clusterCoiSummary", {
                joint: cc.joint_cone_size,
                clusters: cc.clusters.length,
                max: cc.max_cluster_cone_size,
              })}
            </span>
            <span
              className={
                reduced
                  ? "rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
                  : "rounded-full bg-gray-200 px-2 py-0.5 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
              }
            >
              {reduced
                ? t("extraction.verdictTable.clusterCoiReduction", {
                    delta: cc.joint_cone_size - cc.max_cluster_cone_size,
                  })
                : t("extraction.verdictTable.clusterCoiNoReduction")}
            </span>
            {/* R46-4 — per-cluster verification mode: shown when the joint
                design busted the backend state-bit cap and each cluster was
                verified separately (cluster_routing present). */}
            {s.partition_summary!.cluster_routing && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {t("extraction.verdictTable.perClusterMode", {
                  clusters: new Set(
                    Object.values(s.partition_summary!.cluster_routing),
                  ).size,
                })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VerdictRow({ verdict }: { verdict: VerifyPropertyVerdict }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  // mununu#595 — a conditional verdict says what it holds UNDER; when the
  // assumptions admit no fair path it is VACUOUS (amber, not green): the
  // formula is true for nothing.
  const vacuous = verdict.satisfied && verdict.fair_path_exists === false;
  const conditional = (verdict.assumptions?.length ?? 0) > 0;
  const verdictClass = vacuous
    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
    : verdict.satisfied
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  const verdictWord = vacuous
    ? t("extraction.verdictTable.verdictVacuous")
    : verdict.satisfied
      ? t("extraction.verdictTable.verdictSatisfied")
      : t("extraction.verdictTable.verdictViolated");
  const verdictLabel = conditional
    ? t("extraction.verdictTable.verdictUnder", {
        verdict: verdictWord,
        assumptions: (verdict.assumptions ?? []).join(", "),
      })
    : verdictWord;
  const sourceLabel =
    verdict.formula_source.kind === "template"
      ? `${t("extraction.verdictTable.sourceTemplatePrefix")}${verdict.formula_source.id}`
      : t("extraction.verdictTable.sourceInline");

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30"
        onClick={() => setExpanded((e) => !e)}
      >
        <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100">
          <span className="font-mono">{verdict.name}</span>
        </td>
        <td className="px-3 py-2 text-xs">
          <span
            className={`inline-block rounded-full px-2 py-0.5 font-medium ${verdictClass}`}
            title={
              vacuous ? t("extraction.verdictTable.vacuousHint") : undefined
            }
          >
            {verdictLabel}
          </span>
        </td>
        <td className="px-3 py-2 text-xs font-mono text-gray-600 dark:text-gray-400">
          {verdict.over}
        </td>
        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
          {sourceLabel}
        </td>
        <td className="px-3 py-2 text-right text-xs font-mono text-gray-600 dark:text-gray-400">
          {verdict.satisfying_states} / {verdict.total_states}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-800/30">
          <td colSpan={5} className="px-3 py-3 text-xs">
            <div className="space-y-2">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {t("extraction.verdictTable.formulaLabel")}
                </span>
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-gray-600 dark:text-gray-400">
                  {verdict.formula}
                </pre>
              </div>
              <div className="text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">
                  {t("extraction.verdictTable.initialStatesLabel")}
                </span>{" "}
                <span className="font-mono">
                  {t("extraction.verdictTable.satisfyingOfTotal", {
                    satisfying: verdict.initial_satisfying.length,
                    total: verdict.initial_states.length,
                  })}
                </span>
                {verdict.initial_states.length > 0 && (
                  <span className="ml-2 font-mono">
                    [{verdict.initial_states.join(", ")}]
                  </span>
                )}
              </div>
              {verdict.initial_verdict_summary && (
                <div className="text-gray-600 dark:text-gray-400">
                  {/* IR-track P3.1 — 3-valued { T, F, ⊥ } over the
                      initial states. ⊥ ("needs refinement") only appears
                      on the predicate-cube path (P3.3); 0 on bit-blast. */}
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    3-valued (initial):
                  </span>{" "}
                  <Trit summary={verdict.initial_verdict_summary} />
                </div>
              )}
              {verdict.formula_source.kind === "template" &&
                Object.keys(verdict.formula_source.args).length > 0 && (
                  <div className="text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {t("extraction.verdictTable.templateArgsLabel")}
                    </span>{" "}
                    <span className="font-mono">
                      {Object.entries(verdict.formula_source.args)
                        .map(([k, val]) => `${k} = ${val}`)
                        .join(", ")}
                    </span>
                  </div>
                )}
              {conditional && (
                <div className="text-gray-600 dark:text-gray-400">
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {t("extraction.verdictTable.assumptionsLabel")}
                  </span>{" "}
                  <span className="font-mono">
                    {(verdict.assumptions ?? []).join(", ")}
                  </span>
                  {" · "}
                  <span>
                    {verdict.fair_path_exists === false
                      ? t("extraction.verdictTable.vacuousHint")
                      : t("extraction.verdictTable.fairPathExists")}
                  </span>
                </div>
              )}
              {verdict.counterexample && (
                <div className="border-t border-gray-200 pt-2 dark:border-gray-700">
                  <CounterexampleTrace witness={verdict.counterexample} />
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
