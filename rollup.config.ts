import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

// Bundle most dependencies except for Node.js builtins and AWS SDK
const external = [
  'fs/promises',
  'node:fs',
  'node:path',
  'node:os',
  'node:process',
  'node:child_process',
  'node:util',
  '@aws-sdk/client-s3',
]

const extensions = ['.js', '.ts']

/** @type {import('rollup').RollupOptions} */
const config = {
  input: 'src/cli/main.ts',
  output: [
    {
      file: './bin/cli.cjs',
      format: 'cjs',
      banner: '#!/usr/bin/env node',
      inlineDynamicImports: true,
    },
    {
      file: './bin/cli.mjs',
      format: 'esm',
      banner: '#!/usr/bin/env node',
      inlineDynamicImports: true,
    },
  ],
  external,
  plugins: [
    typescript({
      tsconfig: './tsconfig.build.json',
      exclude: [
        'src/**/*.test.ts',
        'tests/**',
        'node_modules/**',
      ],
    }),
    nodeResolve({
      extensions,
      preferBuiltins: true,
    }),
    commonjs(),
    json(),
  ],
}

export default config
