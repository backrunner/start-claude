import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

type BumpType = 'patch' | 'minor' | 'major'

const WORKSPACE_PACKAGES = [
  'packages/cli/package.json',
  'packages/manager/package.json',
  'packages/migrator/package.json',
]

function getNewVersion(currentVersion: string, bumpType: BumpType): string {
  const [major, minor, patch] = currentVersion.split('.').map(Number)

  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

function updatePackageVersion(packagePath: string, newVersion: string): void {
  const fullPath = join(process.cwd(), packagePath)
  const packageJson = JSON.parse(readFileSync(fullPath, 'utf-8'))
  packageJson.version = newVersion
  writeFileSync(fullPath, `${JSON.stringify(packageJson, null, 2)}\n`)
  console.log(`✓ Updated ${packagePath} to ${newVersion}`)
}

function main() {
  const args = process.argv.slice(2)
  const bumpType = (args[0] || 'patch') as BumpType

  if (!['patch', 'minor', 'major'].includes(bumpType)) {
    console.error('Invalid bump type. Use: patch, minor, or major')
    process.exit(1)
  }

  // Read root package.json to get current version
  const rootPackagePath = join(process.cwd(), 'package.json')
  const rootPackage = JSON.parse(readFileSync(rootPackagePath, 'utf-8'))
  const currentVersion = rootPackage.version

  // Calculate new version
  const newVersion = getNewVersion(currentVersion, bumpType)

  console.log(`\nBumping version from ${currentVersion} to ${newVersion} (${bumpType})\n`)

  // Update root package.json
  rootPackage.version = newVersion
  writeFileSync(rootPackagePath, `${JSON.stringify(rootPackage, null, 2)}\n`)
  console.log(`✓ Updated package.json to ${newVersion}`)

  // Update all workspace packages
  for (const packagePath of WORKSPACE_PACKAGES) {
    try {
      updatePackageVersion(packagePath, newVersion)
    }
    catch (error) {
      console.error(`✗ Failed to update ${packagePath}:`, error)
      process.exit(1)
    }
  }

  console.log(`\n✓ All packages updated to version ${newVersion}`)

  // Stage changes
  try {
    execSync('git add package.json packages/*/package.json', { stdio: 'inherit' })
    console.log('\n✓ Staged version changes')
  }
  catch (error) {
    console.warn('\n⚠ Could not stage changes (git may not be available)', error)
  }

  console.log(`\nVersion bump complete! Ready to commit with: git commit -m "chore: bump version to ${newVersion}"`)
}

main()
