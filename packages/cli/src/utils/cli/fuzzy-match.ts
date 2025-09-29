/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

  // Initialize the matrix
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  // Fill the matrix
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      }
      else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1, // deletion
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

/**
 * Calculate similarity score between two strings (0-1, where 1 is identical)
 * Uses a combination of Levenshtein distance and substring matching for better results
 */
function calculateSimilarity(str1: string, str2: string): number {
  const input = str1.toLowerCase()
  const candidate = str2.toLowerCase()

  // Exact match
  if (input === candidate)
    return 1.0

  // If input is a prefix or substring, give high score
  if (candidate.startsWith(input)) {
    return 0.8 + (input.length / candidate.length) * 0.2
  }

  if (candidate.includes(input)) {
    return 0.6 + (input.length / candidate.length) * 0.2
  }

  // Use Levenshtein distance for general similarity
  const maxLength = Math.max(input.length, candidate.length)
  if (maxLength === 0)
    return 1

  const distance = levenshteinDistance(input, candidate)
  return Math.max(0, (maxLength - distance) / maxLength)
}

/**
 * Find the closest matching string from an array of candidates
 */
export function findClosestMatch(input: string, candidates: string[]): { match: string, similarity: number } | null {
  if (candidates.length === 0)
    return null

  let bestMatch = candidates[0]
  let bestSimilarity = calculateSimilarity(input, bestMatch)

  for (let i = 1; i < candidates.length; i++) {
    const similarity = calculateSimilarity(input, candidates[i])
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestMatch = candidates[i]
    }
  }

  return { match: bestMatch, similarity: bestSimilarity }
}

/**
 * Check if a similarity score is high enough to suggest as a fuzzy match
 * A threshold of 0.6 means the strings should be at least 60% similar
 */
export function isSimilarEnough(similarity: number, threshold: number = 0.6): boolean {
  return similarity >= threshold
}

/**
 * Find fuzzy matches for a config name
 */
export function findFuzzyConfigMatches(input: string, configNames: string[], maxSuggestions: number = 3): string[] {
  const matches = configNames
    .map(name => ({
      name,
      similarity: calculateSimilarity(input, name),
    }))
    .filter(item => isSimilarEnough(item.similarity, 0.4)) // Lower threshold for suggestions
    .sort((a, b) => b.similarity - a.similarity) // Sort by similarity descending
    .slice(0, maxSuggestions)
    .map(item => item.name)

  return matches
}
