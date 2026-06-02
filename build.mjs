import { build } from 'esbuild';

// core 는 의존성 0 → 단일 ESM 번들로 산출.
// 소비자(ssot-plugin / ssot-web)는 이 dist/core.mjs + dist/types 를 vendor 복사한다.
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  outfile: 'dist/core.mjs',
});
console.log('✓ dist/core.mjs');
