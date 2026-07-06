const modelAliases: Record<string, string> = {
  'gpt': 'gpt-5.5',
  'openai': 'gpt-5.5',
  'opus': 'claude-opus-4-8',
  'sonnet': 'claude-sonnet-5',
  'fable': 'claude-fable-5',
  'haiku': 'claude-haiku-4-5-20251001',
  'gemini': 'gemini-3.1-pro-preview',
  'deepseek': 'deepseek-v4-pro',
  'deepseek-pro': 'deepseek-v4-pro',
  'deepseek-flash': 'deepseek-v4-flash',
  'glm': 'glm-5.2',
  'kimi': 'kimi-k2.7-code',
  'kimi-highspeed': 'kimi-k2.7-code-highspeed',
}

export function normalizeModelName(model: string | undefined): string | undefined {
  const trimmed = model?.trim()
  if (!trimmed) {
    return undefined
  }

  return modelAliases[trimmed.toLowerCase()] ?? trimmed
}

export function normalizeModelArgs(args: string[]): string[] {
  const normalizedArgs: string[] = []

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]

    if (arg === '--model') {
      const model = args[index + 1]
      normalizedArgs.push(arg)
      if (model !== undefined) {
        normalizedArgs.push(normalizeModelName(model) ?? model)
        index += 1
      }
      continue
    }

    if (arg.startsWith('--model=')) {
      const model = arg.slice('--model='.length)
      normalizedArgs.push(`--model=${normalizeModelName(model) ?? model}`)
      continue
    }

    normalizedArgs.push(arg)
  }

  return normalizedArgs
}
