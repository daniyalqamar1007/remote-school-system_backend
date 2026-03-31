export class PasswordGenerator {
  /**
   * Generate a secure temporary password
   * Format: 3 uppercase + 3 lowercase + 2 numbers + 1 special char = 9 characters
   */
  static generateTemporaryPassword(): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const special = '!@#$%^&*';

    let password = '';
    
    // Add 3 uppercase letters
    for (let i = 0; i < 3; i++) {
      password += uppercase.charAt(Math.floor(Math.random() * uppercase.length));
    }
    
    // Add 3 lowercase letters
    for (let i = 0; i < 3; i++) {
      password += lowercase.charAt(Math.floor(Math.random() * lowercase.length));
    }
    
    // Add 2 numbers
    for (let i = 0; i < 2; i++) {
      password += numbers.charAt(Math.floor(Math.random() * numbers.length));
    }
    
    // Add 1 special character
    password += special.charAt(Math.floor(Math.random() * special.length));
    
    // Shuffle the password characters
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Generate a simple memorable temporary password
   * Format: Word + Number (easier for users to type)
   */
  static generateSimpleTemporaryPassword(): string {
    const words = ['Tiger', 'Eagle', 'River', 'Ocean', 'Storm', 'Cloud', 'Stone', 'Fire', 'Moon', 'Star'];
    const numbers = Math.floor(Math.random() * 900) + 100; // 3-digit number
    
    const word = words[Math.floor(Math.random() * words.length)];
    return `${word}${numbers}!`;
  }
}
