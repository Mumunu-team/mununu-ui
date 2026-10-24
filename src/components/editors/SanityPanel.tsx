import type { SanityReport } from "../../api/endpoints";
import { formatTracePath, traceStateNames } from "../../utils/trace";

const isClean = (r: SanityReport): boolean =>
  r.deadlocks.length === 0 &&
  r.unreachable_states.length === 0 &&
  r.labels_never_fired.length === 0 &&
  r.internal_livelocks.length === 0;

/**
 * Structural findings of `/context/eval` with `sanity: true` (`mununu context eval --sanity`):
 * deadlocks with a path, unreachable states, labels that never fire, internal livelocks.
 */
export const SanityPanel = ({ reports }: { reports?: SanityReport[] }) => {
  if (!reports || reports.length === 0) return null;
  return (
    <div className="unified-editor__sanity" data-testid="sanity-panel">
      {reports.map((r) => (
        <div key={r.automaton} className="unified-editor__sanity-report">
          <div className="unified-editor__sanity-title">
            Model sanity — {r.automaton} ({r.reachable_states} reachable states)
          </div>
          {isClean(r) ? (
            <div className="unified-editor__sanity-clean">
              No deadlock, unreachable state, dead label or internal livelock.
            </div>
          ) : (
            <ul className="unified-editor__sanity-list">
              {r.deadlocks.map((d) => {
                const states = traceStateNames(d);
                return (
                  <li key={`d:${states.join("/")}`}>
                    Deadlock in <code>{states[states.length - 1]}</code>:{" "}
                    <code>{formatTracePath(d)}</code>
                  </li>
                );
              })}
              {r.unreachable_states.map((s) => (
                <li key={`u:${s}`}>
                  Unreachable state <code>{s}</code>
                </li>
              ))}
              {r.labels_never_fired.map((l) => (
                <li key={`l:${l}`}>
                  Label never fires: <code>{l}</code>
                </li>
              ))}
              {r.internal_livelocks.map((c) => (
                <li key={`c:${c.join("/")}`}>
                  Internal livelock over <code>{`{${c.join(", ")}}`}</code>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
};
