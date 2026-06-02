// facet 값 강제(coercion) 헬퍼 — catalog 정규화와 본문 frontmatter 머지가 공유.

import {
  type Confidence,
  type Lifecycle,
  type ParseError,
  type RelatesEdge,
} from './types.js';

export function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.filter((x): x is string => typeof x === 'string');
  }
  if (typeof v === 'string' && v.trim() !== '') return [v];
  return [];
}

export function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
}

const CONFIDENCES: readonly Confidence[] = ['high', 'inferred', 'unverified'];
const LIFECYCLES: readonly Lifecycle[] = ['proposed', 'active', 'deprecated'];

export function asConfidence(v: unknown): Confidence {
  return CONFIDENCES.includes(v as Confidence) ? (v as Confidence) : 'unverified';
}

export function asLifecycle(v: unknown): Lifecycle {
  return LIFECYCLES.includes(v as Lifecycle) ? (v as Lifecycle) : 'active';
}

/** lastVerified: 'YYYY-MM-DD' 만 유효, '0000-00-00'/빈값/형식위반은 null. */
export function asLastVerified(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  if (v === '0000-00-00') return null;
  return v;
}

// ── relatesTo 문자열 복원 ────────────────────────────────────────

const RELATES_TO_KEY = /(?:^|,)\s*to\s*:/;
const RELATES_TYPE_KEY = /,\s*type\s*:/;
const RELATES_NOTE_KEY = /,\s*note\s*:/;

/**
 * catalog 의 lossy relatesTo 문자열을 RelatesEdge 로 복원.
 * 형태: '{ to: concept.agent, type: builds, note: 임의 텍스트(콤마/슬래시 포함 가능) }'
 *
 * note 본문에 콤마가 들어갈 수 있어 단순 콤마 분리는 불가 — 키 위치 기준으로 자른다.
 * to/type 누락이면 null 반환(호출부가 parseError 적재).
 */
export function parseRelatesString(input: string): RelatesEdge | null {
  let s = input.trim();
  if (s.startsWith('{')) s = s.slice(1);
  if (s.endsWith('}')) s = s.slice(0, -1);
  s = s.trim();

  const toMatch = s.match(RELATES_TO_KEY);
  if (!toMatch || toMatch.index === undefined) return null;
  const afterTo = s.slice(toMatch.index + toMatch[0].length);

  const typeRel = afterTo.search(RELATES_TYPE_KEY);
  if (typeRel === -1) return null;
  const toVal = afterTo.slice(0, typeRel).trim();

  const afterType = afterTo.slice(typeRel).replace(RELATES_TYPE_KEY, '');
  const noteRel = afterType.search(RELATES_NOTE_KEY);
  const typeVal = (noteRel === -1 ? afterType : afterType.slice(0, noteRel)).trim();
  if (toVal === '' || typeVal === '') return null;

  const edge: RelatesEdge = { to: toVal, type: typeVal };
  if (noteRel !== -1) {
    const noteVal = afterType.slice(noteRel).replace(RELATES_NOTE_KEY, '').trim();
    if (noteVal !== '') edge.note = noteVal;
  }
  return edge;
}

/** relatesTo 값(문자열 | 객체 혼재 배열)을 RelatesEdge[] 로 복원. */
export function normalizeRelatesToValue(
  v: unknown,
  nodeId: string,
  errors: ParseError[],
): RelatesEdge[] {
  if (!Array.isArray(v)) return [];
  const out: RelatesEdge[] = [];
  for (const item of v) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      const to = asString(rec.to);
      const type = asString(rec.type);
      if (to && type) {
        const edge: RelatesEdge = { to, type };
        const note = asString(rec.note);
        if (note) edge.note = note;
        out.push(edge);
      } else {
        errors.push({
          kind: 'invalidRelatesTo',
          nodeId,
          message: 'relatesTo 객체에 to/type 누락',
          raw: JSON.stringify(item),
        });
      }
    } else if (typeof item === 'string') {
      const parsed = parseRelatesString(item);
      if (parsed) out.push(parsed);
      else {
        errors.push({
          kind: 'invalidRelatesTo',
          nodeId,
          message: 'relatesTo 문자열 파싱 실패',
          raw: item,
        });
      }
    }
  }
  return out;
}
