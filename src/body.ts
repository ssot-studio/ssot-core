// 노드 본문(.md) 파서 + frontmatter(권위) → catalog facets(힌트) 머지.
//
// layering: 본문 .md frontmatter 가 SSOT(권위), catalog 는 캐시/인덱스.
// catalog facets.relatesTo 가 문자열로 손실되므로 본문 frontmatter 가 유일한
// 정상 관계 소스다. loadBody 후 frontmatter 객체형으로 노드 facet 을 덮어쓴다.

import {
  normalizeRelatesToValue,
  asStringArray,
  asString,
  asConfidence,
  asLifecycle,
  asLastVerified,
} from './facet-coerce.js';
import { splitFrontmatter } from './yaml.js';
import {
  type CodeBlock,
  type MarkdownSection,
  type OpenItem,
  type ParseError,
  type SsotNode,
  type SsotNodeBody,
} from './types.js';

// ── 본문 마크다운 파싱 ───────────────────────────────────────────

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^```(.*)$/;
// '- [ ] OPEN: ...' / '- [x] ...' 체크박스
const CHECK_RE = /^\s*-\s*\[([ xX])\]\s*(.*)$/;

interface ParsedMarkdown {
  sections: MarkdownSection[];
  openItems: OpenItem[];
}

/**
 * 본문 마크다운을 heading 단위 섹션으로 분해하고, 코드블록·OPEN 체크박스를 추출.
 * 코드블록 내부의 '#' 는 heading 으로 오인하지 않는다.
 */
export function parseMarkdownBody(markdown: string): ParsedMarkdown {
  const lines = markdown.split('\n');
  const sections: MarkdownSection[] = [];
  const openItems: OpenItem[] = [];

  // heading 이전 프리앰블도 하나의 섹션(level 0)으로 담는다.
  let current: MarkdownSection = { heading: '', level: 0, content: '', codeBlocks: [] };
  const contentLines: string[] = [];
  let inFence = false;
  let fenceLang: string | undefined;
  let fenceText: string[] = [];

  const flushContent = (): void => {
    current.content = contentLines.join('\n').trim();
    if (current.heading !== '' || current.content !== '' || current.codeBlocks.length > 0) {
      sections.push(current);
    }
    contentLines.length = 0;
  };

  for (const line of lines) {
    const fence = line.match(FENCE_RE);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceLang = fence[1].trim() === '' ? undefined : fence[1].trim();
        fenceText = [];
      } else {
        inFence = false;
        const block: CodeBlock = { text: fenceText.join('\n') };
        if (fenceLang) block.lang = fenceLang;
        current.codeBlocks.push(block);
        contentLines.push(line); // 펜스 라인 자체도 content 에 보존(원문 재현용)
      }
      if (inFence) contentLines.push(line);
      continue;
    }
    if (inFence) {
      fenceText.push(line);
      contentLines.push(line);
      continue;
    }

    const check = line.match(CHECK_RE);
    if (check) {
      openItems.push({ checked: check[1].toLowerCase() === 'x', text: check[2].trim() });
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      flushContent();
      current = {
        heading: heading[2].trim(),
        level: heading[1].length,
        content: '',
        codeBlocks: [],
      };
      continue;
    }
    contentLines.push(line);
  }
  flushContent();

  return { sections, openItems };
}

/** 마크다운 문서 전체 → SsotNodeBody. */
export function parseNodeBody(doc: string): SsotNodeBody {
  const { frontmatter, body } = splitFrontmatter(doc);
  const { sections, openItems } = parseMarkdownBody(body);
  return { frontmatter, markdown: body, sections, openItems };
}

// ── frontmatter(권위) → 노드 facet 머지 ──────────────────────────

/**
 * 본문 frontmatter 로 노드 facet 을 덮어쓴다(권위 확정).
 * frontmatter 에 존재하는 키만 덮어쓴다 — 부재 키는 catalog 힌트 값을 보존.
 * relatesTo 는 frontmatter 의 객체 리스트가 정규형이므로 항상 우선.
 * 머지 결과 노드를 반환(원본은 수정하지 않는 복사 머지).
 */
export function mergeBodyIntoNode(
  node: SsotNode,
  body: SsotNodeBody,
  errors: ParseError[] = [],
): SsotNode {
  const fm = body.frontmatter;
  const merged: SsotNode = {
    ...node,
    facets: {
      purpose: { ...node.facets.purpose },
      semantics: { ...node.facets.semantics },
      realization: { ...node.facets.realization },
      meta: { ...node.facets.meta },
    },
    body,
  };

  if ('purpose' in fm) merged.facets.purpose.purpose = asString(fm.purpose) ?? merged.facets.purpose.purpose;
  if ('value' in fm) merged.facets.purpose.value = asString(fm.value) ?? merged.facets.purpose.value;
  if ('servesPersona' in fm) merged.facets.purpose.servesPersona = asStringArray(fm.servesPersona);

  if ('definition' in fm) merged.facets.semantics.definition = asString(fm.definition) ?? merged.facets.semantics.definition;
  if ('relatesTo' in fm) merged.facets.semantics.relatesTo = normalizeRelatesToValue(fm.relatesTo, node.id, errors);
  if ('governedBy' in fm) merged.facets.semantics.governedBy = asStringArray(fm.governedBy);
  if ('governs' in fm) merged.facets.semantics.governs = asStringArray(fm.governs);

  if ('realizedBy' in fm) merged.facets.realization.realizedBy = asStringArray(fm.realizedBy);
  if ('dependsOn' in fm) merged.facets.realization.dependsOn = asStringArray(fm.dependsOn);
  if ('consumesApi' in fm) merged.facets.realization.consumesApi = asStringArray(fm.consumesApi);
  if ('providesApi' in fm) merged.facets.realization.providesApi = asStringArray(fm.providesApi);
  if ('impacts' in fm) merged.facets.realization.impacts = asStringArray(fm.impacts);
  if ('integratesWith' in fm) merged.facets.realization.integratesWith = asStringArray(fm.integratesWith);
  if ('implementedIn' in fm) {
    merged.facets.realization.implementedIn = asStringArray(fm.implementedIn).map((raw) => ({
      from: node.id,
      raw,
      field: 'implementedIn' as const,
    }));
  }

  if ('owner' in fm) merged.facets.meta.owner = asString(fm.owner) ?? merged.facets.meta.owner;
  if ('decidedBy' in fm) merged.facets.meta.decidedBy = asStringArray(fm.decidedBy);
  if ('lifecycle' in fm) merged.facets.meta.lifecycle = asLifecycle(fm.lifecycle);
  if ('confidence' in fm) merged.facets.meta.confidence = asConfidence(fm.confidence);
  if ('lastVerified' in fm) merged.facets.meta.lastVerified = asLastVerified(fm.lastVerified);

  if ('authority' in fm) merged.authority = fm.authority === 'mirrored' ? 'mirrored' : 'authored';
  if ('source' in fm) {
    const src = asString(fm.source);
    if (src) merged.source = src;
  }

  // openCount 는 본문 OPEN 항목 수로 재계산(권위).
  merged.openCount = body.openItems.filter((o) => !o.checked).length;

  return merged;
}
