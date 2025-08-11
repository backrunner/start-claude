import { existsSync } from 'node:fs'
import { chmod, cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

async function copyManagerStandalone() {
  const srcPath = join(process.cwd(), 'src/manager/.next/standalone')
  const staticSrcPath = join(process.cwd(), 'src/manager/.next/static')
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
      } else {
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
  await copyManagerStandalone()
  await makeCliExecutable()
  console.log('✅ Post-build script completed!')
}

main().catch((error) => {
  console.error('❌ Post-build script failed:', error)
  process.exit(1)
})
