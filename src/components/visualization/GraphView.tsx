import { useEffect, useRef } from "react";
import cytoscape, { Core } from "cytoscape";
import dagre from "cytoscape-dagre";
import type { paths } from "../../api/types";
import { graphViewStyles } from "./graphStyles";
import "./GraphView.css";

// Register dagre layout
cytoscape.use(dagre);

type GraphData =
  paths["/api/v1/context/graph"]["post"]["responses"]["200"]["content"]["application/json"]["graphs"][0];

interface GraphViewProps {
  graph: GraphData;
  searchText?: string;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNodeHover?: (nodeId: string | null, data: any) => void;
  layout?: "dagre" | "breadthfirst" | "grid" | "preset";
  onCyInit?: (cy: Core) => void;
}

export const GraphView = ({
  graph,
  searchText = "",
  selectedNodeId = null,
  onNodeSelect,
  onNodeHover,
  layout = "dagre",
  onCyInit,
}: GraphViewProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Cytoscape
    // Convert graph elements to Cytoscape format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elements: any[] = graph.elements.map((el) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element: any = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: el.data as any,
      };
      if (el.position) {
        element.position = el.position;
      }
      if (el.classes) {
        element.classes = el.classes;
      }
      return element;
    });

    const cy = cytoscape({
      container: containerRef.current,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      elements: elements as any,
      style: graphViewStyles,
      layout: {
        name: layout === "preset" ? "preset" : layout,
        fit: true,
        padding: 30,
        animate: false,
      },
    });

    cyRef.current = cy;
    if (onCyInit) onCyInit(cy);

    // Handle node/edge clicks
    cy.on("tap", "node", (evt) => {
      const node = evt.target;
      if (onNodeSelect) {
        onNodeSelect(node.id());
      }
    });

    cy.on("tap", "edge", () => {
      if (onNodeSelect) {
        onNodeSelect(null);
      }
    });

    cy.on("tap", (evt) => {
      if (evt.target === cy) {
        if (onNodeSelect) {
          onNodeSelect(null);
        }
      }
    });

    // Handle hover for tooltips
    cy.on("mouseover", "node", (evt) => {
      const node = evt.target;
      const data = node.data();
      if (onNodeHover) {
        onNodeHover(node.id(), data);
      }
    });

    cy.on("mouseover", "edge", (evt) => {
      const edge = evt.target;
      const data = edge.data();
      if (onNodeHover) {
        onNodeHover(null, data);
      }
    });

    cy.on("mouseout", () => {
      if (onNodeHover) {
        onNodeHover(null, null);
      }
    });

    // Highlight search results
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      cy.nodes().forEach((node) => {
        const label = node.data("label") || "";
        if (label.toLowerCase().includes(searchLower)) {
          node.addClass("search-match");
        } else {
          node.removeClass("search-match");
        }
      });
    }

    // Highlight selected node
    if (selectedNodeId) {
      cy.nodes().forEach((node) => {
        if (node.id() === selectedNodeId) {
          node.select();
        } else {
          node.unselect();
        }
      });
    }

    // Resize Cytoscape when container becomes visible (e.g., tab switch)
    const resizeObserver = new ResizeObserver(() => {
      if (
        containerRef.current &&
        containerRef.current.offsetWidth > 0 &&
        containerRef.current.offsetHeight > 0
      ) {
        cy.resize();
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      cy.destroy();
    };
  }, [graph, layout, searchText, selectedNodeId, onNodeSelect, onNodeHover, onCyInit]);

  return (
    <div className="graph-view-container">
      <div ref={containerRef} className="graph-view-canvas" />
      <div ref={tooltipRef} className="graph-view-tooltip" />
    </div>
  );
};
