import { parseDocument, stringify } from 'yaml'

export interface MarkdownFrontmatter {
  attributes: Record<string, unknown>
  body: string
  hasFrontmatter: boolean
}

const FRONTMATTER_PATTERN = /^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/

export function parseMarkdownFrontmatter(content: string): MarkdownFrontmatter {
  const match = content.match(FRONTMATTER_PATTERN)

  if (!match) {
    if (content.replace(/^\uFEFF/, '').startsWith('---')) {
      throw new Error('Invalid YAML frontmatter block')
    }

    return {
      attributes: {},
      body: content,
      hasFrontmatter: false,
    }
  }

  const document = parseDocument(match[1])
  if (document.errors.length > 0) {
    throw new Error(`Invalid YAML frontmatter: ${document.errors[0].message}`)
  }

  const attributes = document.toJS({ mapAsMap: false }) as unknown
  if (!isRecord(attributes)) {
    throw new Error('YAML frontmatter must be an object')
  }

  return {
    attributes,
    body: (match[2] ?? '').replace(/^\r?\n/, ''),
    hasFrontmatter: true,
  }
}

export function renderMarkdownFrontmatter(
  content: string,
  managedAttributes: Record<string, unknown | undefined>,
): string {
  const parsed = parseMarkdownFrontmatter(content)
  const attributes = { ...parsed.attributes }

  for (const [key, value] of Object.entries(managedAttributes)) {
    if (value === undefined) {
      delete attributes[key]
    }
    else {
      attributes[key] = value
    }
  }

  const yaml = stringify(attributes, { lineWidth: 0 }).trimEnd()
  const body = parsed.body.replace(/^\r?\n/, '')

  return body
    ? `---\n${yaml}\n---\n\n${body}`
    : `---\n${yaml}\n---\n`
}

export function getFrontmatterString(
  attributes: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = attributes[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function getFrontmatterStringList(
  attributes: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = attributes[key]

  if (typeof value === 'string') {
    const values = value.split(',').map(item => item.trim()).filter(Boolean)
    return values.length > 0 ? values : undefined
  }

  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    const values = value.map(item => item.trim()).filter(Boolean)
    return values.length > 0 ? values : undefined
  }

  return undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
