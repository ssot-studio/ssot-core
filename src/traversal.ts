// 관계 트래버설 유틸 — 노드 id 로 인접/역방향 엣지를 조회.
//
// 그래프는 edges 배열이 단일 진실. 반복 조회 비용을 줄이려면 buildAdjacencyIndex 로
// 인덱스를 한 번 만들어 재사용한다(O(1) 조회). 일회성이면 헬퍼 함수를 직접 쓴다.

import { type EdgeRel, type SsotEdge, type SsotGraph, type SsotNode } from './types.js';

export interface EdgeFilter {
  /** 특정 관계만. 미지정이면 전체. */
  rel?: EdgeRel;
  /** rel='relatesTo' 일 때 relationType 일치 필터. */
  relationType?: string;
}

function matches(edge: SsotEdge, filter?: EdgeFilter): boolean {
  if (!filter) return true;
  if (filter.rel !== undefined && edge.rel !== filter.rel) return false;
  if (filter.relationType !== undefined && edge.relationType !== filter.relationType) return false;
  return true;
}

/** id 에서 나가는(out) 엣지. */
export function outgoingEdges(graph: SsotGraph, id: string, filter?: EdgeFilter): SsotEdge[] {
  return graph.edges.filter((e) => e.from === id && matches(e, filter));
}

/** id 로 들어오는(in / 역방향) 엣지. */
export function incomingEdges(graph: SsotGraph, id: string, filter?: EdgeFilter): SsotEdge[] {
  return graph.edges.filter((e) => e.to === id && matches(e, filter));
}

/** id 에서 한 단계 인접한 노드 id (out 방향). */
export function neighbors(graph: SsotGraph, id: string, filter?: EdgeFilter): string[] {
  return unique(outgoingEdges(graph, id, filter).map((e) => e.to));
}

/** id 로 들어오는 역방향 인접 노드 id. */
export function reverseNeighbors(graph: SsotGraph, id: string, filter?: EdgeFilter): string[] {
  return unique(incomingEdges(graph, id, filter).map((e) => e.from));
}

function unique(xs: string[]): string[] {
  return [...new Set(xs)];
}

// ── 인접 인덱스(반복 조회 최적화) ────────────────────────────────

export interface AdjacencyIndex {
  out: Map<string, SsotEdge[]>;
  in: Map<string, SsotEdge[]>;
}

/** edges 를 from/to 키로 한 번에 그룹핑. 반복 트래버설 전 호출. */
export function buildAdjacencyIndex(graph: SsotGraph): AdjacencyIndex {
  const out = new Map<string, SsotEdge[]>();
  const inIdx = new Map<string, SsotEdge[]>();
  for (const edge of graph.edges) {
    push(out, edge.from, edge);
    push(inIdx, edge.to, edge);
  }
  return { out, in: inIdx };
}

function push(map: Map<string, SsotEdge[]>, key: string, edge: SsotEdge): void {
  const arr = map.get(key);
  if (arr) arr.push(edge);
  else map.set(key, [edge]);
}

// ── 부분 그래프 / 탐색 ───────────────────────────────────────────

export interface InducedSubgraph {
  /** S — 노드 id 집합. */
  nodeIds: Set<string>;
  /** S 의 유도 서브그래프 내부 엣지(양 끝이 S 안). */
  edges: SsotEdge[];
}

/** 노드 부분집합 S 의 유도 서브그래프(내부 엣지)를 추출. */
export function inducedSubgraph(graph: SsotGraph, nodeIds: Iterable<string>): InducedSubgraph {
  const set = new Set(nodeIds);
  const edges = graph.edges.filter((e) => set.has(e.from) && set.has(e.to));
  return { nodeIds: set, edges };
}

export interface TraverseOptions {
  filter?: EdgeFilter;
  /** 최대 깊이(미지정=무한). 시작 노드는 depth 0. */
  maxDepth?: number;
  /** 역방향(in) 탐색 여부. 기본 false(out 방향). */
  reverse?: boolean;
}

/**
 * BFS 로 도달 가능한 노드 id 집합(시작 노드 제외). 사이클 안전.
 * index 를 넘기면 O(1) 인접 조회로 가속.
 */
export function reachable(
  graph: SsotGraph,
  startId: string,
  options: TraverseOptions = {},
  index?: AdjacencyIndex,
): Set<string> {
  const { filter, maxDepth = Infinity, reverse = false } = options;
  const idx = index ?? buildAdjacencyIndex(graph);
  const visited = new Set<string>([startId]);
  const result = new Set<string>();
  let frontier: string[] = [startId];
  let depth = 0;
  while (frontier.length > 0 && depth < maxDepth) {
    const next: string[] = [];
    for (const id of frontier) {
      const edges = (reverse ? idx.in.get(id) : idx.out.get(id)) ?? [];
      for (const edge of edges) {
        if (filter && !matches(edge, filter)) continue;
        const target = reverse ? edge.from : edge.to;
        if (visited.has(target)) continue;
        visited.add(target);
        result.add(target);
        next.push(target);
      }
    }
    frontier = next;
    depth++;
  }
  return result;
}

/** 노드 조회 헬퍼(없으면 undefined). */
export function getNode(graph: SsotGraph, id: string): SsotNode | undefined {
  return graph.nodes.get(id);
}
