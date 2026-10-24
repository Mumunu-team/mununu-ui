import { DownloadJsonButton } from "../common/DownloadJsonButton";
import type { Trace } from "../../api/endpoints";
import { TraceView } from "./TraceView";

interface LassoTraceViewerProps {
  /** `lasso` traces (`steps[].state_name`, `steps[].labels`, `loop_start`). */
  traces: Trace[];
  title: string;
}

export const LassoTraceViewer = ({ traces, title }: LassoTraceViewerProps) => {
  if (!traces || traces.length === 0) {
    return (
      <div className="lasso-trace-viewer">
        <p>No lasso traces available</p>
      </div>
    );
  }

  return (
    <div className="lasso-trace-viewer">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <h3 className="lasso-trace-viewer__title">{title}</h3>
        <DownloadJsonButton data={traces} filename="lasso_traces.json" />
      </div>
      {traces.map((trace, index) => (
        <div key={index} className="lasso-trace-viewer__trace">
          <span className="lasso-trace-viewer__label">Trace {index + 1}:</span>
          <TraceView trace={trace} title="" />
        </div>
      ))}
    </div>
  );
};
