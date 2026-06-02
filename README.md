# @ssot-studio/core

SSOT(Single Source of Truth) 시스템의 **코어 로직 라이브러리**. 의존성 0의 순수 함수 모음으로,
SSOT 노드 `.md`(frontmatter + 본문)와 `_catalog.json`을 파싱·정규화·트래버설·구조판별한다.

UI·실행환경·데이터 소스에 무지하다. 어디서 호출하든 동일하게 동작한다.

## 책임

| 모듈 | 역할 |
|------|------|
| `yaml` | frontmatter YAML 파싱 (zero-dep) |
| `body` | 노드 본문 마크다운 파싱 + frontmatter 권위 머지 |
| `loader` · `catalog` | `_catalog.json` 로드 → 정규화 그래프 |
| `structure` | 그래프/트리/매트릭스 구조 판별 |
| `traversal` | impact / neighbors / reachable 트래버설 |
| `facet-coerce` · `types` | 4축 facet 강제 변환 + 타입 |

## 빌드 산출물

```bash
pnpm build
# → dist/core.mjs        (esbuild 단일 ESM 번들, 의존성 인라인 없음 — core 자체가 zero-dep)
# → dist/types/*.d.ts    (tsc 타입 선언)
```

## 소비 방식 — vendor

소비처(`ssot-plugin`, `ssot-web`)는 npm install 이 아니라 **빌드 산출물을 vendor 복사**해 사용한다.
모노레포가 아니라 독립 레포이며, plugin 은 루트부터 clone 되므로 install 단계가 없기 때문이다.

```
ssot-core (빌드) → dist/core.mjs + dist/types
   ↓ vendor sync 스크립트가 복사
ssot-plugin/vendor/core.mjs   (skills 가 상대 import)
ssot-web/vendor/core.mjs      (vite 가 번들)
```

> core 를 수정하면 `pnpm build` 후 vendor sync 를 다시 돌려 소비처에 반영한다. core 는 zero-dep
> 단일 `.mjs` 라 복사가 trivial 하다.

## org

`https://github.com/ssot-studio` (public). 형제 레포: `ssot-plugin`, `ssot-web`.
