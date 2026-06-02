// 의존성 0 제약 하의 frontmatter YAML 파서.
//
// SSOT frontmatter 는 YAML 전체가 아니라 제한된 부분집합만 쓴다:
//   - 스칼라:            key: value
//   - 인용 스칼라:       key: "value"  /  key: 'value'
//   - 플로우 시퀀스:     key: [a, b, c]   (id 리스트)
//   - 블록 시퀀스(스칼라): key:\n  - a\n  - b
//   - 블록 시퀀스(매핑):  key:\n  - to: x\n    type: y\n    note: z   (relatesTo)
//   - 빈 값:             key:            → null
//   - 불리언/숫자:        true|false|123  (그 외는 문자열)
//
// 범용 YAML 라이브러리를 끌어오지 않는 이유: @repo/core 는 의존성 0(그래프 최하단)
// 이며 Node/브라우저 양쪽에서 동작해야 한다. 위 부분집합만 정확히 다루면 충분하다.
// 부분집합을 벗어나는 입력은 문자열 스칼라로 보수적으로 fallback 한다.

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };

interface Line {
  indent: number;
  text: string; // indent 제거된 내용
  raw: string;
}

function tokenize(src: string): Line[] {
  const out: Line[] = [];
  for (const raw of src.split('\n')) {
    // 주석/공백 줄 제거. '#' 는 줄 시작 또는 공백 뒤일 때만 주석으로 본다.
    const stripped = stripInlineComment(raw);
    if (stripped.trim() === '') continue;
    const indent = stripped.length - stripped.trimStart().length;
    out.push({ indent, text: stripped.trim(), raw });
  }
  return out;
}

/** 인용부호 밖의 '#' 이후를 주석으로 제거. */
function stripInlineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      // 줄 시작이거나 직전이 공백일 때만 주석
      if (i === 0 || line[i - 1] === ' ' || line[i - 1] === '\t') {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

function parseScalar(token: string): YamlValue {
  const t = token.trim();
  if (t === '' || t === '~' || t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  // 플로우 시퀀스 [a, b, c]
  if (t.startsWith('[') && t.endsWith(']')) {
    const inner = t.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlow(inner).map((p) => parseScalar(p));
  }
  // 플로우 매핑 { to: x, type: y, note: z } — relatesTo 인라인 표기.
  if (t.startsWith('{') && t.endsWith('}')) {
    const inner = t.slice(1, -1).trim();
    if (inner === '') return {};
    const obj: Record<string, YamlValue> = {};
    for (const pair of splitFlow(inner)) {
      const kv = splitKeyValue(pair);
      if (kv) obj[kv.key] = parseScalar(kv.rest);
    }
    return obj;
  }
  // 숫자(정수/실수). 선행 0 보존 필요한 식별자성 값은 문자열로 둔다.
  if (/^-?\d+$/.test(t) && !/^0\d/.test(t)) return Number(t);
  if (/^-?\d+\.\d+$/.test(t)) return Number(t);
  return t;
}

/** 플로우 시퀀스 내부를 중괄호/대괄호 깊이를 고려해 콤마로 분리. */
function splitFlow(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let cur = '';
  for (const ch of inner) {
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (!inSingle && !inDouble) {
      if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
        continue;
      }
    }
    cur += ch;
  }
  if (cur.trim() !== '') parts.push(cur.trim());
  return parts;
}

/** key: rest 형태를 분리. key 는 인용/공백을 허용하지 않는 단순 키만 다룬다. */
function splitKeyValue(text: string): { key: string; rest: string } | null {
  // 인용부호 밖의 첫 ': ' 또는 줄 끝 ':' 을 구분자로 본다.
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === ':' && !inSingle && !inDouble) {
      const next = text[i + 1];
      if (next === undefined || next === ' ' || next === '\t') {
        return { key: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() };
      }
    }
  }
  return null;
}

/**
 * 블록 매핑을 파싱한다. lines[start..) 중 indent 가 baseIndent 인 키들을 읽고,
 * 다음 키(또는 더 얕은 indent)를 만나면 멈춘다. 소비한 마지막 줄 인덱스를 반환.
 */
function parseBlockMapping(
  lines: Line[],
  start: number,
  baseIndent: number,
): { value: Record<string, YamlValue>; next: number } {
  const obj: Record<string, YamlValue> = {};
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) {
      // 상위 키 없이 더 깊은 들여쓰기 — 형식 오류. 건너뛴다.
      i++;
      continue;
    }
    const kv = splitKeyValue(line.text);
    if (!kv) {
      i++;
      continue;
    }
    const { key, rest } = kv;
    if (rest !== '') {
      obj[key] = parseScalar(rest);
      i++;
      continue;
    }
    // rest 가 비어 있음 → 다음 줄들이 블록 시퀀스 또는 중첩 매핑.
    const childIndent = i + 1 < lines.length ? lines[i + 1].indent : -1;
    if (childIndent > baseIndent && lines[i + 1].text.startsWith('- ')) {
      const seq = parseBlockSequence(lines, i + 1, childIndent);
      obj[key] = seq.value;
      i = seq.next;
    } else if (childIndent > baseIndent && lines[i + 1].text === '-') {
      const seq = parseBlockSequence(lines, i + 1, childIndent);
      obj[key] = seq.value;
      i = seq.next;
    } else if (childIndent > baseIndent) {
      const nested = parseBlockMapping(lines, i + 1, childIndent);
      obj[key] = nested.value;
      i = nested.next;
    } else {
      obj[key] = null;
      i++;
    }
  }
  return { value: obj, next: i };
}

function parseBlockSequence(
  lines: Line[],
  start: number,
  seqIndent: number,
): { value: YamlValue[]; next: number } {
  const arr: YamlValue[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < seqIndent || !line.text.startsWith('-')) break;
    const afterDash = line.text.slice(1).trim(); // '-' 뒤 내용
    // 플로우 표기('- { ... }' / '- [ ... ]')는 통째로 스칼라 파싱(매핑으로 오인 금지).
    const isFlow = afterDash.startsWith('{') || afterDash.startsWith('[');
    const kv = afterDash === '' || isFlow ? null : splitKeyValue(afterDash);
    if (isFlow) {
      arr.push(parseScalar(afterDash));
      i++;
    } else if (kv) {
      // 시퀀스 항목이 매핑: '- to: x' 형태. 같은 항목의 후속 키는 더 들여써짐.
      const item: Record<string, YamlValue> = {};
      if (kv.rest !== '') item[kv.key] = parseScalar(kv.rest);
      else item[kv.key] = null;
      // 후속 줄들(첫 키보다 깊은 indent, '-' 아님)을 같은 매핑 항목으로 흡수.
      const itemKeyIndent = seqIndent + (line.text.length - line.text.slice(1).trimStart().length);
      i++;
      while (i < lines.length) {
        const l = lines[i];
        if (l.indent <= seqIndent) break;
        if (l.text.startsWith('- ') && l.indent === seqIndent) break;
        const sub = splitKeyValue(l.text);
        if (!sub) {
          i++;
          continue;
        }
        if (sub.rest !== '') {
          item[sub.key] = parseScalar(sub.rest);
          i++;
        } else {
          const childIndent = i + 1 < lines.length ? lines[i + 1].indent : -1;
          if (childIndent > l.indent) {
            const nested = parseBlockMapping(lines, i + 1, childIndent);
            item[sub.key] = nested.value;
            i = nested.next;
          } else {
            item[sub.key] = null;
            i++;
          }
        }
      }
      void itemKeyIndent;
      arr.push(item);
    } else {
      // 스칼라 시퀀스 항목: '- value'
      arr.push(parseScalar(afterDash));
      i++;
    }
  }
  return { value: arr, next: i };
}

/** YAML 부분집합 문서를 객체로 파싱. */
export function parseYaml(src: string): Record<string, unknown> {
  const lines = tokenize(src);
  if (lines.length === 0) return {};
  const baseIndent = lines[0].indent;
  const { value } = parseBlockMapping(lines, 0, baseIndent);
  return value;
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface FrontmatterSplit {
  frontmatter: Record<string, unknown>;
  body: string;
  /** frontmatter 블록 존재 여부. */
  hasFrontmatter: boolean;
}

/** 마크다운 문서를 frontmatter 객체와 본문으로 분리. */
export function splitFrontmatter(doc: string): FrontmatterSplit {
  const m = doc.match(FRONTMATTER_RE);
  if (!m) {
    return { frontmatter: {}, body: doc, hasFrontmatter: false };
  }
  return {
    frontmatter: parseYaml(m[1]),
    body: doc.slice(m[0].length),
    hasFrontmatter: true,
  };
}
