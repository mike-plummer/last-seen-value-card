import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const plugins = [nodeResolve(), commonjs(), typescript(), json(), terser()];

const onwarn = (warning, warn) => {
  if (warning.code === 'THIS_IS_UNDEFINED' && warning.id?.includes('/node_modules/')) {
    return;
  }
  warn(warning);
};

export default {
  input: 'src/last-seen-value-card.ts',
  output: {
    file: 'dist/last-seen-value-card.js',
    format: 'es',
    inlineDynamicImports: true,
  },
  plugins,
  onwarn,
};
