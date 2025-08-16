import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import { defineConfig } from 'rollup'

export default defineConfig({
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'cjs',
      exports: 'named',
      sourcemap: true,
    },
    {
      file: 'dist/index.esm.js',
      format: 'es',
      exports: 'named',
      sourcemap: true,
    },
  ],
  external: ['node:fs', 'node:path', 'node:os'],
  plugins: [
    nodeResolve({
      preferBuiltins: true,
      extensions: ['.js', '.ts'],
    }),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: './dist',
      outDir: './dist',
      sourceMap: true,
    }),
    commonjs(),
  ],
})
