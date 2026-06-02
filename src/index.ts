// @repo/core — SSOT 도메인의 단일 진실 (파서 · 정규화 모델 · 구조 판별).
// framework-agnostic 순수 TypeScript. Node(cli/daemon)와 브라우저(web) 양쪽에서 동작.
// 의존성 0, 그래프 최하단 — ui/cli/daemon/web 어느 것도 import 하지 않는다.

// ── 정규화 도메인 타입 ───────────────────────────────────────────
export type {
  SsotKind,
  Confidence,
  Authority,
  Lifecycle,
  FacetPurpose,
  FacetSemantics,
  FacetRealization,
  FacetAuthorityMeta,
  SsotFacets,
  RelatesEdge,
  ProvenancePath,
  SsotNode,
  SsotEdge,
  EdgeRel,
  SsotGraph,
  ParseError,
  ParseErrorKind,
  CodeBlock,
  MarkdownSection,
  OpenItem,
  SsotNodeBody,
} from './types.js';
export { SSOT_KINDS, ID_PREFIX_TO_KIND, EDGE_RELS } from './types.js';

// ── YAML frontmatter 파서 ────────────────────────────────────────
export { parseYaml, splitFrontmatter } from './yaml.js';
export type { YamlValue, FrontmatterSplit } from './yaml.js';

// ── facet 강제 / relatesTo 복원 ──────────────────────────────────
export {
  parseRelatesString,
  normalizeRelatesToValue,
  asStringArray,
  asString,
  asConfidence,
  asLifecycle,
  asLastVerified,
} from './facet-coerce.js';

// ── catalog 로드 / 정규화 ────────────────────────────────────────
export { normalize, splitEdgeRel } from './catalog.js';
export type {
  RawCatalog,
  RawCatalogNode,
  RawCatalogEdge,
  RawCatalogPath,
} from './catalog.js';

// ── 본문 파서 / 권위 머지 ────────────────────────────────────────
export { parseMarkdownBody, parseNodeBody, mergeBodyIntoNode } from './body.js';

// ── 로더 인터페이스 ──────────────────────────────────────────────
export {
  DefaultCatalogLoader,
  loadBody,
  hydrateNodeBody,
} from './loader.js';
export type {
  SsotCatalogLoader,
  SsotNodeBodyLoader,
  LoadBodyResult,
} from './loader.js';

// ── 관계 트래버설 ────────────────────────────────────────────────
export {
  outgoingEdges,
  incomingEdges,
  neighbors,
  reverseNeighbors,
  buildAdjacencyIndex,
  inducedSubgraph,
  reachable,
  getNode,
} from './traversal.js';
export type {
  EdgeFilter,
  AdjacencyIndex,
  InducedSubgraph,
  TraverseOptions,
} from './traversal.js';

// ── 태그 분류 / 필터 ─────────────────────────────────────────────
export {
  parseTag,
  collectTagGroups,
  nodeMatchesTags,
  filterNodeIds,
  NAMESPACE_LABELS,
} from './tags.js';
export type { HasTags, ParsedTag, TagNamespaceGroup } from './tags.js';

// ── 구조 판별 ────────────────────────────────────────────────────
export {
  classify,
  classifyStructure,
  computeSignals,
  detectStateSignals,
  isTreeShaped,
  DEFAULT_THRESHOLDS,
} from './structure.js';
export type {
  StructureKind,
  StructureSignals,
  ClassifyThresholds,
  ClassifyInput,
  ClassifyResult,
} from './structure.js';
