// catalog(_catalog.json) 로드 · 정규화.
//
// 핵심 발견(설계):
// (1) relatesTo 의 권위(authority)는 본문 .md frontmatter(YAML 객체)다.
//     현행 catalog 의 nodes[].facets.relatesTo 도 정상 객체({to,type[,note]})로 직렬화되며,
//     normalizeRelatesToValue 가 객체/문자열 양형을 복원한다(문자열 경로는 구형 catalog 방어용).
// (2) catalog edges 는 relatesTo 관계타입을 'relatesTo:owns' 접미사로 인코딩.
//     → ':' 로 분해해 relationType 복원.

import {
  asConfidence,
  asLastVerified,
  asLifecycle,
  asString,
  asStringArray,
  normalizeRelatesToValue,
} from './facet-coerce.js';
import {
  ID_PREFIX_TO_KIND,
  SSOT_KINDS,
  EDGE_RELS,
  type Authority,
  type EdgeRel,
  type ParseError,
  type ProvenancePath,
  type SsotEdge,
  type SsotFacets,
  type SsotGraph,
  type SsotKind,
  type SsotNode,
} from './types.js';

// ── Raw catalog 형상(파일에서 읽히는 그대로) ──────────────────────

export interface RawCatalogNode {
  id: string;
  kind: string;
  title: string;
  file: string;
  confidence?: string;
  owner?: string;
  lifecycle?: string;
  lastVerified?: string;
  openCount?: number;
  /** 분류 태그 — "namespace:value" 형식. catalog top-level. */
  tags?: unknown;
  facets?: Record<string, unknown>;
}

export interface RawCatalogEdge {
  from: string;
  to: string;
  rel: string;
}

export interface RawCatalogPath {
  from: string;
  field: string;
  raw: string;
}

export interface RawCatalog {
  generatedFrom: string;
  nodeCount: number;
  edgeCount: number;
  nodes: RawCatalogNode[];
  edges: RawCatalogEdge[];
  paths: RawCatalogPath[];
  parseErrors?: unknown[];
}

function asAuthority(v: unknown): Authority {
  return v === 'mirrored' ? 'mirrored' : 'authored';
}

// ── edge rel 분해 ────────────────────────────────────────────────

/**
 * catalog edge.rel 을 정규화. 'relatesTo:owns' → { rel:'relatesTo', relationType:'owns' }.
 * 알 수 없는 rel 은 null(호출부가 parseError 적재).
 */
export function splitEdgeRel(rel: string): { rel: EdgeRel; relationType?: string } | null {
  const colon = rel.indexOf(':');
  if (colon === -1) {
    return EDGE_RELS.includes(rel as EdgeRel) ? { rel: rel as EdgeRel } : null;
  }
  const head = rel.slice(0, colon);
  const tail = rel.slice(colon + 1).trim();
  if (head === 'relatesTo') {
    return { rel: 'relatesTo', relationType: tail === '' ? undefined : tail };
  }
  return EDGE_RELS.includes(head as EdgeRel) ? { rel: head as EdgeRel } : null;
}

// ── kind / id 검증 ───────────────────────────────────────────────

const ID_PATTERN =
  /^(platform|persona|domain|concept|capability|component|integration|invariant|decision|rule|screen|endpoint|flow)\.[a-z0-9][a-z0-9-]*$/;

function asKind(v: unknown, id: string, errors: ParseError[]): SsotKind {
  if (typeof v === 'string' && (SSOT_KINDS as readonly string[]).includes(v)) {
    return v as SsotKind;
  }
  // id prefix 로 보강 시도
  const prefix = id.split('.', 1)[0];
  const fromPrefix = ID_PREFIX_TO_KIND[prefix];
  if (fromPrefix) {
    return fromPrefix;
  }
  errors.push({
    kind: 'unknownKind',
    nodeId: id,
    message: `알 수 없는 kind: ${String(v)}`,
    raw: String(v),
  });
  return 'Concept';
}

// ── facet 그룹 매핑 ──────────────────────────────────────────────

function buildFacets(
  raw: Record<string, unknown>,
  node: RawCatalogNode,
  errors: ParseError[],
): SsotFacets {
  return {
    purpose: {
      purpose: asString(raw.purpose),
      value: asString(raw.value),
      servesPersona: asStringArray(raw.servesPersona),
    },
    semantics: {
      definition: asString(raw.definition),
      relatesTo: normalizeRelatesToValue(raw.relatesTo, node.id, errors),
      governedBy: asStringArray(raw.governedBy),
      governs: asStringArray(raw.governs),
    },
    realization: {
      realizedBy: asStringArray(raw.realizedBy),
      implementedIn: asStringArray(raw.implementedIn).map((rawPath) => ({
        from: node.id,
        raw: rawPath,
        field: 'implementedIn' as const,
      })),
      dependsOn: asStringArray(raw.dependsOn),
      consumesApi: asStringArray(raw.consumesApi),
      providesApi: asStringArray(raw.providesApi),
      impacts: asStringArray(raw.impacts),
      integratesWith: asStringArray(raw.integratesWith),
    },
    meta: {
      owner: asString(raw.owner) ?? asString(node.owner) ?? 'TBD',
      decidedBy: asStringArray(raw.decidedBy),
      lifecycle: asLifecycle(raw.lifecycle ?? node.lifecycle),
      confidence: asConfidence(raw.confidence ?? node.confidence),
      lastVerified: asLastVerified(raw.lastVerified ?? node.lastVerified),
    },
  };
}

function buildNode(raw: RawCatalogNode, errors: ParseError[]): SsotNode {
  if (!ID_PATTERN.test(raw.id)) {
    errors.push({
      kind: 'invalidId',
      nodeId: raw.id,
      message: `id 패턴 위반: ${raw.id}`,
      raw: raw.id,
    });
  }
  const facetsRaw = (raw.facets ?? {}) as Record<string, unknown>;
  const node: SsotNode = {
    id: raw.id,
    kind: asKind(raw.kind ?? facetsRaw.kind, raw.id, errors),
    title: raw.title ?? asString(facetsRaw.title) ?? raw.id,
    file: raw.file,
    authority: asAuthority(facetsRaw.authority),
    // 태그: catalog top-level 이 권위. 누락 시 facets.tags 로 폴백(구형/대체 직렬화 방어).
    tags: asStringArray(raw.tags ?? facetsRaw.tags),
    facets: buildFacets(facetsRaw, raw, errors),
    openCount: typeof raw.openCount === 'number' ? raw.openCount : 0,
  };
  const source = asString(facetsRaw.source);
  if (source) node.source = source;
  return node;
}

// ── normalize ────────────────────────────────────────────────────

/**
 * RawCatalog → SsotGraph.
 * (1) edges[].rel 을 ':' 로 split → relationType 복원.
 * (2) catalog facets.relatesTo 의 문자열 복원(본문 로드 시 객체형으로 덮어쓸 hint).
 * (3) facet → 4축 그룹 매핑.
 * (4) 끊긴 엣지(to/from 미존재 노드) 탐지해 parseErrors 적재.
 */
export function normalize(raw: RawCatalog): SsotGraph {
  const errors: ParseError[] = [];
  const nodes = new Map<string, SsotNode>();

  for (const rn of raw.nodes) {
    const node = buildNode(rn, errors);
    nodes.set(node.id, node);
  }

  const edges: SsotEdge[] = [];
  for (const re of raw.edges) {
    const split = splitEdgeRel(re.rel);
    if (!split) {
      errors.push({
        kind: 'danglingEdge',
        message: `알 수 없는 edge rel: ${re.rel}`,
        raw: `${re.from} -> ${re.to} (${re.rel})`,
      });
      continue;
    }
    const edge: SsotEdge = { from: re.from, to: re.to, rel: split.rel };
    if (split.relationType !== undefined) edge.relationType = split.relationType;
    edges.push(edge);

    if (!nodes.has(re.from)) {
      errors.push({
        kind: 'danglingEdge',
        nodeId: re.from,
        message: `엣지 from 노드 미존재: ${re.from}`,
        raw: `${re.from} -> ${re.to} (${re.rel})`,
      });
    }
    if (!nodes.has(re.to)) {
      errors.push({
        kind: 'danglingEdge',
        nodeId: re.to,
        message: `엣지 to 노드 미존재: ${re.to}`,
        raw: `${re.from} -> ${re.to} (${re.rel})`,
      });
    }
  }

  const paths: ProvenancePath[] = raw.paths
    .filter((p) => p.field === 'implementedIn')
    .map((p) => ({ from: p.from, raw: p.raw, field: 'implementedIn' as const }));

  return {
    generatedFrom: raw.generatedFrom,
    nodes,
    edges,
    paths,
    parseErrors: errors,
  };
}
