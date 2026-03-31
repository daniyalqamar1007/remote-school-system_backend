import * as path from 'path';
import * as fs from 'fs';

export function ensureUploadsFolder() {
  const uploadsPath = path.join(process.cwd(), 'uploads'); // Ensure it's in the project root
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
}

export function countTokens(text: string) {
  return text.split(/\s+/).length; // Approximate token count
}

export function generateUniqueFileName() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 100000); // Optional for extra uniqueness
  const fileName = `file_${timestamp}_${random}`;
  return fileName;
}

// Function to decode JWT
export function decodeJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join(''),
  );

  return JSON.parse(jsonPayload);
}
