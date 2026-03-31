import * as crypto from 'crypto';
import { Types } from 'mongoose';


/**
 * Generate a consistent MongoDB ObjectID-like string
 * @param {string} input - Your custom input string
 * @returns {string} - 24-character hexadecimal MongoDB ObjectID-like string
 */

export function generateMongoIdFormat(input:string) {
  // Hash the input string using SHA-256
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  // Take the first 24 characters of the hash
  return hash.substring(0, 24);
}


export const mongoId = (id: string): any => {
  return new Types.ObjectId(generateMongoIdFormat(id));
};
