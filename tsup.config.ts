import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'wavesurfer.js'],
  treeshake: true,
  minify: false,
  splitting: false,
  // Copy CSS file to dist
  esbuildPlugins: [],
  onSuccess: 'cp src/styles/wavesurfer-player.css dist/styles.css',
});
