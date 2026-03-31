export function generateStudentId(firstName: string, lastName: string, enrollmentYear?: string): string {
  // Get first letter of first name and last name
  const firstInitial = firstName.charAt(0).toUpperCase();
  const lastInitial = lastName.charAt(0).toUpperCase();
  
  // Get last 2 digits of enrollment year or current year
  const year = enrollmentYear ? enrollmentYear.slice(-2) : new Date().getFullYear().toString().slice(-2);
  
  // Generate random 3-digit number
  const randomNum = Math.floor(100 + Math.random() * 900);
  
  // Format: FLYYnnn (e.g., JD24001)
  return `${firstInitial}${lastInitial}${year}${randomNum}`;
}
