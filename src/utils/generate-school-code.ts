/**
 * Generates a school code based on the school name
 * Format: First letter of each word + sequential number (if needed)
 * Example: "International Grammar School" -> "IGS001"
 */
export function generateSchoolCode(name: string, existingCodes: string[] = []): string {
  // Get first letter of each word, convert to uppercase
  let baseCode = name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase();
  
  // Ensure the base code is at least 2 characters
  if (baseCode.length < 2) {
    baseCode = baseCode.padEnd(2, 'S');
  }
  
  // If baseCode is not taken, use it
  if (!existingCodes.includes(baseCode)) {
    return baseCode;
  }
  
  // Otherwise, add numbers until we find an unused code
  let counter = 1;
  let code: string;
  do {
    code = `${baseCode}${String(counter).padStart(3, '0')}`;
    counter++;
  } while (existingCodes.includes(code));
  
  return code;
}
