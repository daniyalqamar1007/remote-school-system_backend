/**
 * Utility function to normalize grade levels across the system
 * Converts various grade level formats to a standard format
 * 
 * Standard format: "K" for Kindergarten, "1"-"12" for grades 1-12
 * 
 * Examples:
 * - "Grade 1" -> "1"
 * - "1" -> "1"
 * - "Kindergarten" -> "K"
 * - "K" -> "K"
 * - "grade 1" -> "1"
 */
export function normalizeGradeLevel(grade: string | undefined | null): string {
  if (!grade) return '';
  
  // Convert to string and trim whitespace
  const normalized = String(grade).trim();
  
  if (!normalized) return '';
  
  // Handle "Kindergarten" variations (case-insensitive)
  const lowerGrade = normalized.toLowerCase();
  if (lowerGrade === 'kindergarten' || lowerGrade === 'k') {
    return 'K';
  }
  
  // Remove "Grade " or "grade " prefix if present (case-insensitive)
  // Handle "Grade 1", "grade 1", "Grade1", etc.
  let result = normalized;
  if (lowerGrade.startsWith('grade ')) {
    result = normalized.substring(6).trim(); // Remove "Grade " (6 characters)
  } else if (lowerGrade.startsWith('grade')) {
    // Handle "Grade1" (no space)
    result = normalized.substring(5).trim(); // Remove "Grade" (5 characters)
  }
  
  // Handle numeric grades (1-12) - just return as-is if it's a number
  // Also handle "1st", "2nd", etc. by extracting the number
  const numericMatch = result.match(/^(\d+)/);
  if (numericMatch) {
    const num = parseInt(numericMatch[1], 10);
    // Validate it's a valid grade (1-12)
    if (num >= 1 && num <= 12) {
      return String(num);
    }
  }
  
  // If it's just "K", return it
  if (result.toUpperCase() === 'K') {
    return 'K';
  }
  
  // Return the normalized result (could be the original if no transformation was needed)
  return result;
}

/**
 * Normalize an array of grade levels
 */
export function normalizeGradeLevels(grades: (string | undefined | null)[]): string[] {
  return grades
    .map(g => normalizeGradeLevel(g))
    .filter(g => g !== ''); // Remove empty values
}

/**
 * Check if a student's grade level is eligible for a program's allowed grade levels
 * Normalizes both before comparing
 */
export function isGradeEligible(studentGrade: string | undefined | null, allowedGrades: string[]): boolean {
  const normalizedStudentGrade = normalizeGradeLevel(studentGrade);
  if (!normalizedStudentGrade) return false;
  
  const normalizedAllowedGrades = normalizeGradeLevels(allowedGrades);
  if (normalizedAllowedGrades.length === 0) return false;
  
  return normalizedAllowedGrades.includes(normalizedStudentGrade);
}
