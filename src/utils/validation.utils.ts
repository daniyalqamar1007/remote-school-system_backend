export class ValidationUtils {
  /**
   * Validates if a string is a valid MongoDB ObjectId
   */
  static isValidObjectId(id: string): boolean {
    if (!id || typeof id !== 'string') {
      return false;
    }
    
    const trimmedId = id.trim();
    if (trimmedId.length === 0) {
      return false;
    }
    
    // MongoDB ObjectId is a 24-character hexadecimal string
    const objectIdRegex = /^[0-9a-fA-F]{24}$/;
    return objectIdRegex.test(trimmedId);
  }

  /**
   * Filters an array of IDs to only include valid ObjectIds
   */
  static filterValidObjectIds(ids: any[]): string[] {
    if (!Array.isArray(ids)) {
      return [];
    }
    
    return ids
      .filter(id => this.isValidObjectId(id))
      .map(id => id.toString().trim());
  }

  /**
   * Validates and sanitizes a single ObjectId
   */
  static sanitizeObjectId(id: any): string | null {
    if (this.isValidObjectId(id)) {
      return id.toString().trim();
    }
    return null;
  }
}
