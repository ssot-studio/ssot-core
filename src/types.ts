// @repo/core — 정규화 도메인 타입 (single source of truth).
//
// 설계 근거:
// - 스키마(ssot-v1.schema.json)가 facet 을 [축①~④] 로 라벨링하므로 타입으로 승격해
//   뷰어가 '축별 완전성/누락' 을 컴파일타임에 다룰 수 있게 한다.
// - relatesTo 는 catalog(문자열, lossy)이 아니라 본문 frontmatter(객체)를 정규형으로
//   채택한다 — single source of truth 원칙. catalog 의 문자열은 인덱스 힌트로만 쓴다.

/** 스키마 enum 의 10 종 kind (frontmatter 표기 그대로). */
export type SsotKind =
  | 'Platform'
  | 'Persona'
  | 'Domain'
  | 'Concept'
  | 'Capability'
  | 'SystemComponent'
  | 'Integration'
  | 'Invariant'
  | 'Decision'
  | 'EngineeringRule';

export const SSOT_KINDS: readonly SsotKind[] = [
  'Platform',
  'Persona',
  'Domain',
  'Concept',
  'Capability',
  'SystemComponent',
  'Integration',
  'Invariant',
  'Decision',
  'EngineeringRule',
] as const;

/** id prefix(소문자) → kind 매핑. 스키마 id 패턴의 prefix 와 1:1. */
export const ID_PREFIX_TO_KIND: Readonly<Record<string, SsotKind>> = {
  platform: 'Platform',
  persona: 'Persona',
  domain: 'Domain',
  concept: 'Concept',
  capability: 'Capability',
  component: 'SystemComponent',
  integration: 'Integration',
  invariant: 'Invariant',
  decision: 'Decision',
  rule: 'EngineeringRule',
} as const;

export type Confidence = 'high' | 'inferred' | 'unverified';
export type Authority = 'authored' | 'mirrored';
export type Lifecycle = 'proposed' | 'active' | 'deprecated';

/** [축①] 목적·가치·서비스 대상 페르소나. */
export interface FacetPurpose {
  purpose?: string;
  value?: string;
  servesPersona: string[];
}

/** relatesTo 객체(정상 복원형). 본문 frontmatter 의 권위 형태. */
export interface RelatesEdge {
  to: string;
  type: string;
  note?: string;
}

/** [축②] 정의·개념 관계·거버넌스. */
export interface FacetSemantics {
  definition?: string;
  relatesTo: RelatesEdge[];
  governedBy: string[];
  governs: string[];
}

/**
 * implementedIn provenance 경로.
 * verify 의 실존 검사 결과(exists)를 선택적으로 보유.
 */
export interface ProvenancePath {
  from?: string;
  raw: string;
  field: 'implementedIn';
  exists?: boolean;
}

/** [축③] 실현·구현·의존·파급. */
export interface FacetRealization {
  realizedBy: string[];
  implementedIn: ProvenancePath[];
  dependsOn: string[];
  consumesApi: string[];
  providesApi: string[];
  impacts: string[];
  integratesWith: string[];
}

/** [축④] 권위 메타: 소유자·결정·생명주기·신뢰도. */
export interface FacetAuthorityMeta {
  owner: string;
  decidedBy: string[];
  lifecycle: Lifecycle;
  confidence: Confidence;
  lastVerified: string | null;
}

export interface SsotFacets {
  purpose: FacetPurpose;
  semantics: FacetSemantics;
  realization: FacetRealization;
  meta: FacetAuthorityMeta;
}

/** 정규화 노드. */
export interface SsotNode {
  id: string;
  kind: SsotKind;
  title: string;
  /** 본문 .md 경로(catalog generatedFrom 기준 상대). */
  file: string;
  /** 생략 시 'authored'. */
  authority: Authority;
  /** mirrored 전용 — 원본 파일 경로. */
  source?: string;
  facets: SsotFacets;
  /** 미확정(OPEN) 개수. */
  openCount: number;
  /** 본문 lazy 로드 후 채워짐. */
  body?: SsotNodeBody;
}

export type EdgeRel =
  | 'realizedBy'
  | 'servesPersona'
  | 'governedBy'
  | 'impacts'
  | 'governs'
  | 'dependsOn'
  | 'decidedBy'
  | 'relatesTo';

export const EDGE_RELS: readonly EdgeRel[] = [
  'realizedBy',
  'servesPersona',
  'governedBy',
  'impacts',
  'governs',
  'dependsOn',
  'decidedBy',
  'relatesTo',
] as const;

export interface SsotEdge {
  from: string;
  to: string;
  rel: EdgeRel;
  /** rel='relatesTo' 일 때 'relatesTo:<type>' 의 <type>. */
  relationType?: string;
}

export type ParseErrorKind =
  | 'danglingEdge'
  | 'invalidRelatesTo'
  | 'unknownKind'
  | 'invalidId'
  | 'malformedFrontmatter';

export interface ParseError {
  kind: ParseErrorKind;
  /** 관련 노드 id (있으면). */
  nodeId?: string;
  message: string;
  /** 원본 값(디버깅용). */
  raw?: string;
}

/** 정규화 그래프 — 뷰어가 소비하는 단일 모델. */
export interface SsotGraph {
  generatedFrom: string;
  nodes: Map<string, SsotNode>;
  edges: SsotEdge[];
  paths: ProvenancePath[];
  parseErrors: ParseError[];
}

// ── 본문(body) 모델 ─────────────────────────────────────────────

export interface CodeBlock {
  lang?: string;
  text: string;
}

export interface MarkdownSection {
  heading: string;
  level: number;
  content: string;
  codeBlocks: CodeBlock[];
}

/** '- [ ] OPEN:' 라인. */
export interface OpenItem {
  checked: boolean;
  text: string;
}

export interface SsotNodeBody {
  frontmatter: Record<string, unknown>;
  markdown: string;
  sections: MarkdownSection[];
  openItems: OpenItem[];
}
