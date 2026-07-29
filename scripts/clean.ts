import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'

async function cleanDirectories(): Promise<void> {
  const directories = [
    join(process.cwd(), 'packages/manager/.next'),
    join(process.cwd(), 'bin'),
  ]

  console.log('🧹 Cleaning build directories...')

  for (const dir of directories) {
    try {
      await rm(dir, { recursive: true, force: true })
      console.log(`✅ Cleaned: ${dir}`)
    }
    catch (error) {
      // Ignore errors if directory doesn't exist
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        console.log(`ℹ️  Directory not found (already clean): ${dir}`)
      }
      else {
        console.error(`❌ Failed to clean ${dir}:`, error)
        process.exit(1)
      }
    }
  }

  console.log('✨ Clean completed!')
}

cleanDirectories().catch((error) => {
  console.error('❌ Clean script failed:', error)
  process.exit(1)
})
