import process from 'node:process'

/**
 * Filter out proxy command and its positional arguments.
 */
export function filterProxyArgs(): string[] {
  const args = process.argv.slice(2)

  const proxySpecificFlags = [
    '--strategy',
    '--all',
    '--skip-health-check',
  ]

  let seenProxyCommand = false
  let skipNext = false

  return args.filter((arg, index) => {
    if (skipNext) {
      skipNext = false
      return false
    }

    if (arg === 'proxy') {
      seenProxyCommand = true
      return false
    }

    if (proxySpecificFlags.some(flag => arg.startsWith(flag))) {
      if (arg === '--strategy' && index + 1 < args.length && !args[index + 1].startsWith('-')) {
        skipNext = true
      }
      return false
    }

    if (arg.startsWith('-')) {
      return true
    }

    if (seenProxyCommand) {
      return false
    }

    return true
  })
}
