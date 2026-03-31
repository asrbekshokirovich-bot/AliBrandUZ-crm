/**
 * Calculates the Levenshtein distance between two strings.
 * This measures the minimum number of single-character edits 
 * (insertions, deletions, or substitutions) required to change one string into the other.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(
          dp[i - 1][j],    // deletion
          dp[i][j - 1],    // insertion
          dp[i - 1][j - 1] // substitution
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Normalizes a product name by lowercasing and trimming multiple spaces
 */
export function normalizeProductName(name: string): string {
  if (!name) return '';
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Determines if two product names are likely duplicates based on Levenshtein distance.
 * Typical threshold is 2 for a strong match, but only if the word is long enough.
 */
export function areProductsLikelyDuplicates(nameA: string, nameB: string): boolean {
  const normA = normalizeProductName(nameA);
  const normB = normalizeProductName(nameB);
  
  // Exact match after normalization
  if (normA === normB) return true;
  
  // They are too short to safely fuzzy match without false positives
  if (normA.length < 5 || normB.length < 5) {
    return false;
  }
  
  const distance = levenshteinDistance(normA, normB);
  
  // If the names are long enough, a distance of 1 or 2 is considered a typo/duplicate
  const threshold = Math.min(2, Math.floor(Math.max(normA.length, normB.length) / 4));
  
  return distance <= threshold;
}

export interface DuplicateGroup<T> {
  normalizedName: string;
  items: T[];
}

/**
 * Groups a list of items into connected duplicate groups
 */
export function findDuplicateGroups<T>(
  items: T[], 
  getName: (item: T) => string
): DuplicateGroup<T>[] {
  const groups: DuplicateGroup<T>[] = [];
  const visited = new Set<number>();
  
  for (let i = 0; i < items.length; i++) {
    if (visited.has(i)) continue;
    
    const currentName = getName(items[i]);
    const currentGroup: T[] = [items[i]];
    visited.add(i);
    
    for (let j = i + 1; j < items.length; j++) {
      if (visited.has(j)) continue;
      
      const candidateName = getName(items[j]);
      
      // If candidate is a duplicate to AT LEAST ONE item already in the group
      // (This connects transitively: A~B, B~C)
      const isDuplicate = currentGroup.some(member => 
        areProductsLikelyDuplicates(getName(member), candidateName)
      );
      
      if (isDuplicate) {
        currentGroup.push(items[j]);
        visited.add(j);
      }
    }
    
    if (currentGroup.length > 1) {
      groups.push({
        normalizedName: normalizeProductName(currentName),
        items: currentGroup
      });
    }
  }
  
  return groups;
}
