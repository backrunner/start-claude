function levenshteinDistance(str1, str2) {
    const matrix = [];
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
            }
        }
    }
    return matrix[str2.length][str1.length];
}
function calculateSimilarity(str1, str2) {
    const input = str1.toLowerCase();
    const candidate = str2.toLowerCase();
    if (input === candidate)
        return 1.0;
    if (candidate.startsWith(input)) {
        return 0.8 + (input.length / candidate.length) * 0.2;
    }
    if (candidate.includes(input)) {
        return 0.6 + (input.length / candidate.length) * 0.2;
    }
    const maxLength = Math.max(input.length, candidate.length);
    if (maxLength === 0)
        return 1;
    const distance = levenshteinDistance(input, candidate);
    return Math.max(0, (maxLength - distance) / maxLength);
}
export function findClosestMatch(input, candidates) {
    if (candidates.length === 0)
        return null;
    let bestMatch = candidates[0];
    let bestSimilarity = calculateSimilarity(input, bestMatch);
    for (let i = 1; i < candidates.length; i++) {
        const similarity = calculateSimilarity(input, candidates[i]);
        if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestMatch = candidates[i];
        }
    }
    return { match: bestMatch, similarity: bestSimilarity };
}
export function isSimilarEnough(similarity, threshold = 0.6) {
    return similarity >= threshold;
}
export function findFuzzyConfigMatches(input, configNames, maxSuggestions = 3) {
    const matches = configNames
        .map(name => ({
        name,
        similarity: calculateSimilarity(input, name),
    }))
        .filter(item => isSimilarEnough(item.similarity, 0.4))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxSuggestions)
        .map(item => item.name);
    return matches;
}
