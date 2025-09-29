import { existsSync } from 'node:fs'
import { chmod, cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import * as ts from 'typescript'

async function copyMigrationsDir() {
  const srcPath = join(process.cwd(), 'packages/migrator/migrations')
  const destPath = join(process.cwd(), 'bin/migrations')

  try {
    if (!existsSync(srcPath)) {
      console.warn(`Warning: Migrations source path does not exist: ${srcPath}`)
      return
    }

    await mkdir(join(process.cwd(), 'bin'), { recursive: true })

    console.log(`Copying ${srcPath} to ${destPath}...`)
    await cp(srcPath, destPath, {
      recursive: true,
      force: true,
    })

    console.log('✅ Migrations directory copied successfully!')
  }
  catch (error) {
    console.error('❌ Failed to copy migrations directory:', error)
    process.exit(1)
  }
}

async function transpileMigrationScripts() {
  const scriptsDir = join(process.cwd(), 'bin/migrations/scripts')

  try {
    if (!existsSync(scriptsDir))
      return

    const files = await readdir(scriptsDir)
    const tsFiles = files.filter(f => f.endsWith('.ts'))

    for (const file of tsFiles) {
      const abs = join(scriptsDir, file)
      const code = await readFile(abs, 'utf8')
      const transpiled = ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          skipLibCheck: true,
          sourceMap: false,
        },
        fileName: file,
      })

      const outPath = abs.replace(/\.ts$/, '.mjs')
      await writeFile(outPath, transpiled.outputText, 'utf8')
    }

    if (tsFiles.length > 0)
      console.log(`✅ Transpiled migration scripts to .mjs (${tsFiles.length} files)`)
  }
  catch (error) {
    console.error('❌ Failed to transpile migration scripts:', error)
    process.exit(1)
  }
}

async function rewriteDefinitionScriptPaths() {
  const defsDir = join(process.cwd(), 'bin/migrations/definitions')

  try {
    if (!existsSync(defsDir))
      return

    const files = await readdir(defsDir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))

    let updatedCount = 0
    for (const file of jsonFiles) {
      const abs = join(defsDir, file)
      const content = await readFile(abs, 'utf8')
      const data = JSON.parse(content)
      if (Array.isArray(data.operations)) {
        let changed = false
        for (const op of data.operations) {
          if (op && op.type === 'run_script' && typeof op.scriptPath === 'string' && op.scriptPath.endsWith('.ts')) {
            op.scriptPath = op.scriptPath.replace(/\.ts$/, '.mjs')
            changed = true
          }
        }
        if (changed) {
          await writeFile(abs, JSON.stringify(data, null, 2), 'utf8')
          updatedCount++
        }
      }
    }

    if (updatedCount > 0)
      console.log(`✅ Updated migration definitions scriptPath to .mjs (${updatedCount} files)`)
  }
  catch (error) {
    console.error('❌ Failed to rewrite migration definitions:', error)
    process.exit(1)
  }
}

async function copyManagerStandalone() {
  const srcPath = join(process.cwd(), 'packages/manager/.next/standalone')
  const staticSrcPath = join(process.cwd(), 'packages/manager/.next/static')
  const destPath = join(process.cwd(), 'bin/manager')

  try {
    if (!existsSync(srcPath)) {
      console.warn(`Warning: Source path does not exist: ${srcPath}`)
      return
    }

    await mkdir(join(process.cwd(), 'bin'), { recursive: true })

    // Copy standalone files
    console.log(`Copying ${srcPath} to ${destPath}...`)
    await cp(srcPath, destPath, {
      recursive: true,
      force: true,
    })

    // Copy static assets following official Next.js instructions: cp -r .next/static .next/standalone/.next/
    // The static assets need to go to .next/static inside the copied standalone directory
    if (existsSync(staticSrcPath)) {
      const staticDestPath = join(destPath, '.next/static')
      console.log(`Copying static assets to ${staticDestPath}...`)
      await cp(staticSrcPath, staticDestPath, {
        recursive: true,
        force: true,
      })
      console.log('✅ Static assets copied successfully!')
    }

    console.log('✅ Manager standalone files copied successfully!')
  }
  catch (error) {
    console.error('❌ Failed to copy manager standalone files:', error)
    process.exit(1)
  }
}

async function makeCliExecutable() {
  // Only run chmod on macOS and Linux
  if (process.platform === 'darwin' || process.platform === 'linux') {
    const cliPath = join(process.cwd(), 'bin/cli.mjs')

    try {
      if (existsSync(cliPath)) {
        await chmod(cliPath, 0o755)
        console.log('✅ Made CLI executable on macOS/Linux')
      }
      else {
        console.warn(`Warning: CLI file not found at ${cliPath}`)
      }
    }
    catch (error) {
      console.error('❌ Failed to make CLI executable:', error)
      process.exit(1)
    }
  }
}

async function main() {
  console.log('🔧 Running post-build script...')
  await copyMigrationsDir()
  await transpileMigrationScripts()
  await rewriteDefinitionScriptPaths()
  await copyManagerStandalone()
  await makeCliExecutable()
  console.log('✅ Post-build script completed!')
}

main().catch((error) => {
  console.error('❌ Post-build script failed:', error)
  process.exit(1)
})
