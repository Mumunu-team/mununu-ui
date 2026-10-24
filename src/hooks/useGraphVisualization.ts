import { useState, useCallback, useRef } from "react";
import { getContextGraphs } from "../api/endpoints";
import { useToast } from "./useToast";
import { useErrorHandler } from "./useErrorHandler";
import type { paths } from "../api/types";
import type cytoscape from "cytoscape";

type ContextGraphsResponse =
  paths["/api/v1/context/graph"]["post"]["responses"]["200"]["content"]["application/json"];

export type GraphType = "dsl" | "unrolled";
export type LayoutType = "dagre" | "breadthfirst" | "grid" | "preset";

export interface GraphVisualizationState {
  graphs: ContextGraphsResponse["graphs"];
  isLoading: boolean;
  lastFetched?: Date;
  error?: string;
  selectedGraphIndex: number;
  selectedGraphType: GraphType;
  selectedAutomaton: string | null;
  searchText: string;
  selectedNodeId: string | null;
}

export const useGraphVisualization = () => {
  const [state, setState] = useState<GraphVisualizationState>({
    graphs: [],
    isLoading: false,
    selectedGraphIndex: 0,
    selectedGraphType: "dsl",
    selectedAutomaton: null,
    searchText: "",
    selectedNodeId: null,
  });
  const cytoscapeRef = useRef<cytoscape.Core | null>(null);
  const toast = useToast();
  const { handleError } = useErrorHandler();

  const fetchGraphs = useCallback(
    async (
      context: string,
      contextName?: string,
      graphTypes: GraphType[] = ["dsl", "unrolled"],
      automaton?: string | null,
      sidecars: Array<{ name: string; content: string }> = [],
      includeControllers: boolean = true,
      minimizeControllers?: boolean,
    ) => {
      if (!context.trim()) {
        toast.showError("Cannot generate graphs from empty context");
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, error: undefined }));

      try {
        const response = await getContextGraphs({
          context: {
            name: contextName || "untitled.ctxdsl",
            content: context,
          },
          graph_types: graphTypes,
          automaton: automaton || null,
          sidecars: sidecars.map((sc) => ({
            name: sc.name,
            content: sc.content,
          })),
          include_controllers: includeControllers,
          minimize_controllers: minimizeControllers,
        });

        if (!response.success || !response.graphs.length) {
          toast.showError("No graphs generated");
          setState({
            graphs: [],
            isLoading: false,
            error: "No graphs generated",
            selectedGraphIndex: 0,
            selectedGraphType: "dsl",
            selectedAutomaton: null,
            searchText: "",
            selectedNodeId: null,
          });
          return;
        }

        setState({
          graphs: response.graphs,
          isLoading: false,
          lastFetched: new Date(),
          error: undefined,
          selectedGraphIndex: 0,
          selectedGraphType: graphTypes[0] || "dsl",
          selectedAutomaton: automaton || null,
          searchText: "",
          selectedNodeId: null,
        });

        toast.showSuccess(`Generated ${response.graphs.length} graph(s)`);
      } catch (error) {
        const errorMessage = handleError(error);
        setState((prev) => ({
          ...prev,
          graphs: [],
          isLoading: false,
          error: errorMessage,
        }));
        toast.showError(`Failed to generate graphs: ${errorMessage}`);
      }
    },
    [toast, handleError],
  );

  const setSelectedGraphIndex = useCallback((index: number) => {
    setState((prev) => ({ ...prev, selectedGraphIndex: index }));
  }, []);

  const setSelectedGraphType = useCallback((type: GraphType) => {
    setState((prev) => ({ ...prev, selectedGraphType: type }));
  }, []);

  const setSelectedAutomaton = useCallback((automaton: string | null) => {
    setState((prev) => ({ ...prev, selectedAutomaton: automaton }));
  }, []);

  const setSearchText = useCallback((text: string) => {
    setState((prev) => ({ ...prev, searchText: text }));
  }, []);

  const setSelectedNodeId = useCallback((nodeId: string | null) => {
    setState((prev) => ({ ...prev, selectedNodeId: nodeId }));
  }, []);

  const clearGraphs = useCallback(() => {
    setState({
      graphs: [],
      isLoading: false,
      error: undefined,
      selectedGraphIndex: 0,
      selectedGraphType: "dsl",
      selectedAutomaton: null,
      searchText: "",
      selectedNodeId: null,
    });
    if (cytoscapeRef.current) {
      cytoscapeRef.current.destroy();
      cytoscapeRef.current = null;
    }
  }, []);

  // Get available automata from graphs
  const getAvailableAutomata = useCallback(() => {
    const automata = new Set<string>();
    state.graphs.forEach((graph) => {
      if (graph.automaton) {
        automata.add(graph.automaton);
      }
    });
    return Array.from(automata).sort();
  }, [state.graphs]);

  // Get filtered graphs based on selected type and automaton
  // Always include controller graphs regardless of type filter
  const getFilteredGraphs = useCallback(() => {
    return state.graphs.filter((graph) => {
      const graphType = graph.graph_type as string;
      if (graphType === "controller") {
        // Controller graphs always pass the type filter
        if (
          state.selectedAutomaton &&
          graph.automaton !== state.selectedAutomaton
        ) {
          return false;
        }
        return true;
      }
      if (
        state.selectedGraphType &&
        graph.graph_type !== state.selectedGraphType
      ) {
        return false;
      }
      if (
        state.selectedAutomaton &&
        graph.automaton !== state.selectedAutomaton
      ) {
        return false;
      }
      return true;
    });
  }, [state.graphs, state.selectedGraphType, state.selectedAutomaton]);

  return {
    state,
    cytoscapeRef,
    fetchGraphs,
    setSelectedGraphIndex,
    setSelectedGraphType,
    setSelectedAutomaton,
    setSearchText,
    setSelectedNodeId,
    clearGraphs,
    getAvailableAutomata,
    getFilteredGraphs,
  };
};
