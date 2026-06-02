// 구조 판별 — 노드 부분집합 S + 유도 서브그래프(내부 엣지 E) → 시각화 형태.
//
// 4 형태: graph | tree | table | stateMachine.
// 판별 우선순위(소거식, 첫 매치 채택):
//   1) stateMachine — 본문에 상태 enum + 전이 서술이 동시 충족(본문 한정 신호, 오탐 최저).
//   2) tree — 계층 관계 지배 + 단일 루트 acyclic(in-degree ≤ 1).
//   3) table — 균질 항목집합 + 내부 관계 거의 없음(edgeDensity 가드).
//   4) graph — fallback(정보 손실 0, 가독성 비용 큼 → 마지막).

import { type SsotEdge, type SsotNode } from './types.js';

export type StructureKind = 'graph' | 'tree' | 'table' | 'stateMachine';

export interface StructureSignals {
  size: number;
  /** |E| / |S| (자기 자신 제외 내부 엣지 밀도). */
  edgeDensity: number;
  /** 계층성(contains/owns/realizedBy 등) rel 비율. */
  containmentRatio: number;
  /** 비계층(relatesTo/impacts/dependsOn 등) 관계 수. */
  symmetricRels: number;
  /** 단일 kind 비율(최빈 kind / size). */
  kindHomogeneity: number;
  /** 동일 facet 키 집합 보유 노드 비율. */
  facetUniformity: number;
  /** 본문에 'A | B | C' 상태 enum 존재. */
  hasStateEnum: boolean;
  /** 본문에 '→' 전이 서술 존재. */
  hasTransitionProse: boolean;
}

export interface ClassifyThresholds {
  treeContainmentRatio: number; // ≥
  tableKindHomogeneity: number; // ≥
  tableFacetUniformity: number; // ≥
  tableMaxEdgeDensity: number; // <
}

export const DEFAULT_THRESHOLDS: ClassifyThresholds = {
  treeContainmentRatio: 0.8,
  tableKindHomogeneity: 0.9,
  tableFacetUniformity: 0.7,
  tableMaxEdgeDensity: 0.2,
};

/** 계층성으로 간주하는 관계명/rel. */
const CONTAINMENT_RELS = new Set<string>([
  'realizedBy',
  'servesPersona',
  'governs',
  'owns',
  'contains',
]);
/** relatesTo relationType 중 계층성으로 보는 것. */
const CONTAINMENT_RELATION_TYPES = new Set<string>(['owns', 'contains', 'has', 'includes']);
/** 비계층(대칭/파급) 관계. */
const SYMMETRIC_RELS = new Set<string>(['impacts', 'dependsOn']);

function isContainmentEdge(e: SsotEdge): boolean {
  if (e.rel === 'relatesTo') {
    return e.relationType !== undefined && CONTAINMENT_RELATION_TYPES.has(e.relationType);
  }
  return CONTAINMENT_RELS.has(e.rel);
}

function isSymmetricEdge(e: SsotEdge): boolean {
  if (SYMMETRIC_RELS.has(e.rel)) return true;
  if (e.rel === 'relatesTo') {
    return !(e.relationType !== undefined && CONTAINMENT_RELATION_TYPES.has(e.relationType));
  }
  return false;
}

// ── 본문 상태머신 신호 ───────────────────────────────────────────

// 상태 enum: 'RUNNING | CLOSED | DELETED' 또는 'ACTIVE|EXPIRED' (2개 이상 토큰).
const STATE_ENUM_RE = /\b[A-Z][A-Z0-9_]{1,}(?:\s*\|\s*[A-Z][A-Z0-9_]{1,}){1,}/;
// 전이 서술: '발급 → 연장 → 만료' (화살표 2개 이상이면 확실, 1개도 인정).
const TRANSITION_RE = /\S\s*(?:→|->|=>)\s*\S/;
// 상태 문맥 키워드(오탐 억제용): status/state/상태/생명주기/lifecycle.
const STATE_CONTEXT_RE = /(status|state|상태|생명주기|lifecycle)/i;

/** 노드 본문 마크다운에서 상태 enum / 전이 서술 신호를 추출. */
export function detectStateSignals(markdown: string): {
  hasStateEnum: boolean;
  hasTransitionProse: boolean;
} {
  const hasEnumRaw = STATE_ENUM_RE.test(markdown);
  // enum 토큰이 상태 문맥(또는 충분히 많은 대문자 토큰) 근처일 때만 인정.
  const hasStateEnum = hasEnumRaw && (STATE_CONTEXT_RE.test(markdown) || hasEnumRaw);
  const hasTransitionProse = TRANSITION_RE.test(markdown);
  return { hasStateEnum, hasTransitionProse };
}

// ── 신호 추출 ────────────────────────────────────────────────────

function facetKeySet(node: SsotNode): string {
  const keys: string[] = [];
  const f = node.facets;
  if (f.purpose.purpose) keys.push('purpose');
  if (f.purpose.value) keys.push('value');
  if (f.purpose.servesPersona.length) keys.push('servesPersona');
  if (f.semantics.definition) keys.push('definition');
  if (f.semantics.relatesTo.length) keys.push('relatesTo');
  if (f.semantics.governedBy.length) keys.push('governedBy');
  if (f.semantics.governs.length) keys.push('governs');
  if (f.realization.realizedBy.length) keys.push('realizedBy');
  if (f.realization.implementedIn.length) keys.push('implementedIn');
  if (f.realization.dependsOn.length) keys.push('dependsOn');
  if (f.realization.consumesApi.length) keys.push('consumesApi');
  if (f.realization.providesApi.length) keys.push('providesApi');
  if (f.realization.impacts.length) keys.push('impacts');
  if (f.realization.integratesWith.length) keys.push('integratesWith');
  if (f.meta.decidedBy.length) keys.push('decidedBy');
  return keys.sort().join(',');
}

/**
 * 노드 부분집합 + 내부 엣지에서 신호를 계산.
 * stateMachine 신호는 본문 의존 — body 미로드 시 false(상위 판별이 graph/tree/table 로 귀결).
 */
export function computeSignals(nodes: SsotNode[], edges: SsotEdge[]): StructureSignals {
  const size = nodes.length;
  if (size === 0) {
    return {
      size: 0,
      edgeDensity: 0,
      containmentRatio: 0,
      symmetricRels: 0,
      kindHomogeneity: 0,
      facetUniformity: 0,
      hasStateEnum: false,
      hasTransitionProse: false,
    };
  }

  const containment = edges.filter(isContainmentEdge).length;
  const symmetric = edges.filter(isSymmetricEdge).length;
  const containmentRatio = edges.length === 0 ? 0 : containment / edges.length;

  // kind 동질성
  const kindCount = new Map<string, number>();
  for (const n of nodes) kindCount.set(n.kind, (kindCount.get(n.kind) ?? 0) + 1);
  const maxKind = Math.max(...kindCount.values());
  const kindHomogeneity = maxKind / size;

  // facet 키집합 동질성
  const facetCount = new Map<string, number>();
  for (const n of nodes) {
    const key = facetKeySet(n);
    facetCount.set(key, (facetCount.get(key) ?? 0) + 1);
  }
  const maxFacet = Math.max(...facetCount.values());
  const facetUniformity = maxFacet / size;

  // 상태머신 신호(본문 합집합)
  let hasStateEnum = false;
  let hasTransitionProse = false;
  for (const n of nodes) {
    if (n.body) {
      const sig = detectStateSignals(n.body.markdown);
      if (sig.hasStateEnum) hasStateEnum = true;
      if (sig.hasTransitionProse) hasTransitionProse = true;
    }
  }

  return {
    size,
    edgeDensity: edges.length / size,
    containmentRatio,
    symmetricRels: symmetric,
    kindHomogeneity,
    facetUniformity,
    hasStateEnum,
    hasTransitionProse,
  };
}

// ── acyclic 단일루트 포함관계 검사(tree) ─────────────────────────

/**
 * 유도 서브그래프가 트리형(각 노드 in-degree ≤ 1, 사이클 없음)인지 검사.
 * 계층성 엣지만으로 판정한다.
 */
export function isTreeShaped(nodeIds: Set<string>, edges: SsotEdge[]): boolean {
  const hierEdges = edges.filter(isContainmentEdge);
  if (hierEdges.length === 0) return false;

  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) {
    indeg.set(id, 0);
    adj.set(id, []);
  }
  for (const e of hierEdges) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    adj.get(e.from)?.push(e.to);
  }
  // in-degree ≤ 1
  for (const d of indeg.values()) {
    if (d > 1) return false;
  }
  // 사이클 검사(DFS)
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const id of nodeIds) color.set(id, WHITE);
  const hasCycle = (u: string): boolean => {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v);
      if (c === GRAY) return true;
      if (c === WHITE && hasCycle(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  };
  for (const id of nodeIds) {
    if (color.get(id) === WHITE && hasCycle(id)) return false;
  }
  return true;
}

// ── 분류 ─────────────────────────────────────────────────────────

export interface ClassifyInput {
  nodes: SsotNode[];
  edges: SsotEdge[];
}

export interface ClassifyResult {
  kind: StructureKind;
  signals: StructureSignals;
  /** 판별 이유(디버깅/UI 설명용). */
  reason: string;
}

/** 신호 → 구조 종류. 소거식 우선순위로 첫 매치 채택. */
export function classifyStructure(
  signals: StructureSignals,
  nodeIds: Set<string>,
  edges: SsotEdge[],
  thresholds: ClassifyThresholds = DEFAULT_THRESHOLDS,
): { kind: StructureKind; reason: string } {
  // 1) stateMachine
  if (signals.hasStateEnum && signals.hasTransitionProse) {
    return {
      kind: 'stateMachine',
      reason: '본문에 상태 enum + 전이 서술 동시 존재',
    };
  }

  // 2) tree
  if (
    signals.containmentRatio >= thresholds.treeContainmentRatio &&
    isTreeShaped(nodeIds, edges)
  ) {
    return {
      kind: 'tree',
      reason: `계층 관계 지배(containmentRatio=${signals.containmentRatio.toFixed(2)}) + 단일루트 acyclic`,
    };
  }

  // 3) table
  if (
    signals.kindHomogeneity >= thresholds.tableKindHomogeneity &&
    signals.facetUniformity >= thresholds.tableFacetUniformity &&
    signals.edgeDensity < thresholds.tableMaxEdgeDensity
  ) {
    return {
      kind: 'table',
      reason: `균질 집합(kindHomogeneity=${signals.kindHomogeneity.toFixed(2)}, facetUniformity=${signals.facetUniformity.toFixed(2)}) + 낮은 edgeDensity(${signals.edgeDensity.toFixed(2)})`,
    };
  }

  // 4) graph(fallback)
  return {
    kind: 'graph',
    reason:
      signals.symmetricRels > 0
        ? `비계층 관계(symmetricRels=${signals.symmetricRels}) 존재 → 그래프`
        : '혼합 kind / 관계엣지 중심 → 그래프(fallback)',
  };
}

/** 입력(노드+엣지) → 신호 계산 + 분류 한 번에. */
export function classify(
  input: ClassifyInput,
  thresholds: ClassifyThresholds = DEFAULT_THRESHOLDS,
): ClassifyResult {
  const signals = computeSignals(input.nodes, input.edges);
  const nodeIds = new Set(input.nodes.map((n) => n.id));
  const { kind, reason } = classifyStructure(signals, nodeIds, input.edges, thresholds);
  return { kind, signals, reason };
}
