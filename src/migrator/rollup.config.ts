import commonjs from '@rollup/plugin-commonjs'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'
import { defineConfig } from 'rollup'
import { cpSync, existsSync, mkdirSync } from 'node:fs'

// Plugin to copy migrations directory
const copyMigrations = () => ({
  name: 'copy-migrations',
  generateBundle() {
    try {
      if (existsSync('migrations')) {
        if (!existsSync('dist')) {
          mkdirSync('dist', { recursive: true })
        }
        cpSync('migrations', 'dist/migrations', { recursive: true })
        console.log('✅ Migrations directory copied to dist/')
      }
      else {
        console.warn('⚠️  Migrations directory not found, skipping copy')
      }
    }
    catch (error) {
      console.warn('⚠️  Failed to copy migrations directory:', error)
    }
  },
})

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
    copyMigrations(),
  ],
})
