import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/vercel.ts' },
  format: ['esm'],
  target: 'node20',
  clean: true,
  outDir: 'api',
  bundle: true,
  outExtension() {
    return { js: `.mjs` };
  }
});
