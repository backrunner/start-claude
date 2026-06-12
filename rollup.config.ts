import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import alias from '@rollup/plugin-alias'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Bundle all third-party dependencies - only exclude Node.js builtins and Next.js (for manager)
const external = [
  'fs/promises',
  'node:fs',
  'node:path',
  'node:os',
  'node:process',
  'node:child_process',
  'node:util',
  'node:http',
  'node:https',
  'node:url',
  'node:buffer',
  'node:stream',
  'node:stream/promises',
  'next/server',
  'next',
]

const extensions = ['.js', '.ts']
const migratorDistPath = pathResolve(__dirname, 'packages/migrator/dist/index.esm.js')

function createCliConfig(inputName, outputName) {
  return {
  input: pathResolve(__dirname, `packages/cli/src/cli/${inputName}.ts`),
  output: [
    {
      file: pathResolve(__dirname, `bin/${outputName}.cjs`),
      format: 'cjs',
      banner: '#!/usr/bin/env node',
      inlineDynamicImports: true,
    },
    {
      file: pathResolve(__dirname, `bin/${outputName}.mjs`),
      format: 'esm',
      banner: '#!/usr/bin/env node',
      inlineDynamicImports: true,
    },
  ],
  external,
  plugins: [
    alias({
      entries: [
        { find: '@start-claude/migrator', replacement: migratorDistPath },
        { find: '@', replacement: pathResolve(__dirname, 'packages/cli/src') },
      ],
    }),
    typescript({
      tsconfig: pathResolve(__dirname, 'packages/cli/tsconfig.build.json'),
    }),
    nodeResolve({
      extensions,
      preferBuiltins: true,
    }),
    commonjs({
      ignoreDynamicRequires: true,
    }),
    json(),
  ],
  }
}

const config = [
  createCliConfig('main', 'cli'),
  createCliConfig('codex', 'start-codex'),
  createCliConfig('gemini', 'start-gemini'),
]

export default config
