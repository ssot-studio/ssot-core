# @ssot-studio/core — 작업 규칙

이 레포는 SSOT 시스템의 **단일 로직 출처**다. plugin(MCP·스킬)과 web 이 모두 이 코어를 vendor 로
공유한다. 로직 중복은 금지 — 파서·그래프·트래버설은 여기에만 있어야 한다.

## 불변 규칙

| 규칙 | 사유 |
|------|------|
| **의존성 0 유지** (`dependencies: {}`) | vendor 단일 `.mjs` 번들 성립의 전제. 외부 패키지 추가 금지 |
| **순수 함수** | UI·실행환경·데이터 소스에 무지. side-effect/IO 금지 |
| **타입 커버리지 100%** | `any` 금지. export 심볼은 명시적 타입 |
| **진입점 = `src/index.ts`** | 모든 public API 는 여기서 re-export. esbuild entry |

## 변경 후 필수

1. `pnpm typecheck` — 타입 무결성
2. `pnpm build` — `dist/core.mjs` + `dist/types` 산출
3. **vendor sync** — 소비처(ssot-plugin, ssot-web)에 빌드물 복사 (그래야 변경이 반영됨)

## 하지 말 것

- 외부 npm 패키지 의존 추가 (zero-dep 깨짐)
- 특정 프로젝트(예: my-project) 도메인 지식을 코어에 박기 — 코어는 범용
- 로직을 소비처(plugin/web)에 재구현 — 중복 금지
