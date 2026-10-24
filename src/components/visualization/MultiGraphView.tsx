import { useState, useRef, useCallback, useEffect } from "react";
import { GraphView } from "./GraphView";
import { GraphControls } from "./GraphControls";
import { GraphMetadata } from "./GraphMetadata";
import { Tabs } from "../common/Tabs";
import type { paths } from "../../api/types";
import type { LayoutType } from "../../hooks/useGraphVisualization";
import "./MultiGraphView.css";

type GraphData =
  paths["/api/v1/context/graph"]["post"]["responses"]["200"]["content"]["application/json"]["graphs"][0];

interface MultiGraphViewProps {
  graphs: GraphData[];
  searchText: string;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
}

export const MultiGraphView = ({
  graphs,
  searchText,
  selectedNodeId,
  onNodeSelect,
}: MultiGraphViewProps) => {
  const [selectedGraphIndex, setSelectedGraphIndex] = useState(0);
  const [layout, setLayout] = useState<LayoutType>("dagre");
  const [isExpanded, setIsExpanded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphViewRef = useRef<{ cy?: any }>(null);

  // Escape key exits expanded mode
  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsExpanded(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  const currentGraph = graphs[selectedGraphIndex];

  const handleZoomIn = useCallback(() => {
    const cy = graphViewRef.current?.cy;
    if (cy) {
      cy.zoom(cy.zoom() * 1.2);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    const cy = graphViewRef.current?.cy;
    if (cy) {
      cy.zoom(cy.zoom() * 0.8);
    }
  }, []);

  const handleFit = useCallback(() => {
    const cy = graphViewRef.current?.cy;
    if (cy) {
      cy.fit(undefined, 50);
    }
  }, []);

  const handleReset = useCallback(() => {
    const cy = graphViewRef.current?.cy;
    if (cy) {
      cy.reset();
      cy.fit(undefined, 50);
    }
  }, []);

  const handleLayoutChange = useCallback((newLayout: string) => {
    setLayout(newLayout as LayoutType);
  }, []);

  const handleExportPNG = useCallback(() => {
    const cy = graphViewRef.current?.cy;
    if (!cy) return;
    const png = cy.png({ full: true, scale: 2, bg: "#ffffff" });
    const link = document.createElement("a");
    link.href = png;
    link.download = `${currentGraph?.automaton || "graph"}-${currentGraph?.graph_type || "dsl"}.png`;
    link.click();
  }, [currentGraph]);

  if (!currentGraph) {
    return (
      <div className="multi-graph-view-empty">
        <p>No graphs available</p>
      </div>
    );
  }

  const tabs = graphs.map((graph: GraphData, index: number) => ({
    id: `graph-${index}`,
    label: `${graph.automaton} (${graph.graph_type})`,
    content: (
      <div className="multi-graph-view-content">
        <GraphMetadata
          automaton={graph.automaton}
          graphType={graph.graph_type}
          statesCount={graph.metadata.states_count}
          transitionsCount={graph.metadata.transitions_count}
          initialStates={graph.metadata.initial_states}
        />
        <div className="multi-graph-view-graph-wrapper">
          <GraphControls
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFit={handleFit}
            onReset={handleReset}
            onLayoutChange={handleLayoutChange}
            currentLayout={layout}
            onToggleExpand={() => setIsExpanded((prev) => !prev)}
            isExpanded={isExpanded}
            onExportPNG={handleExportPNG}
          />
          <div className="multi-graph-view-graph-container">
            <GraphView
              key={`${graph.automaton}-${graph.graph_type}-${layout}`}
              graph={graph}
              searchText={searchText}
              selectedNodeId={selectedNodeId}
              onNodeSelect={onNodeSelect}
              layout={layout}
              onCyInit={(cy) => {
                graphViewRef.current = { cy };
              }}
            />
          </div>
        </div>
      </div>
    ),
  }));

  return (
    <div className={`multi-graph-view ${isExpanded ? "multi-graph-view--expanded" : ""}`}>
      <Tabs
        tabs={tabs}
        onChange={(tabId) => {
          const index = parseInt(tabId.replace("graph-", ""), 10);
          if (!isNaN(index)) {
            setSelectedGraphIndex(index);
          }
        }}
        defaultTab={tabs[0]?.id}
      />
    </div>
  );
};
