import * as fs from 'node:fs'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

// Bundle most dependencies except for Node.js builtins
const external = ['fs/promises', 'node:fs', 'node:path', 'node:os', 'node:process', 'node:child_process', 'node:util']

const extensions = ['.js', '.ts']

/** @type {import('rollup').RollupOptions} */
const config = {
  input: 'src/main.ts',
  output: [
    {
      file: './bin/cli.cjs',
      format: 'cjs',
      banner: '#!/usr/bin/env node',
    },
    {
      file: './bin/cli.mjs',
      format: 'esm',
      banner: '#!/usr/bin/env node',
    },
  ],
  external,
  plugins: [
    nodeResolve({
      extensions,
      preferBuiltins: true,
    }),
    commonjs(),
    json(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationMap: false,
    }),
  ],
}

export default config
