import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

/**
 * Build S3 key path with organized folder structure for schools
 * Structure: schools/{school-name-unique}/{entity-type}/{folder-type}/{filename}
 * 
 * @param schoolName - Name of the school (will be sanitized)
 * @param schoolId - Unique school ID for uniqueness
 * @param entityType - Type of entity: 'students', 'nurses', 'teachers', etc.
 * @param folderType - Type of folder: 'profile-images', 'transcripts', etc.
 * @param fileName - Name of the file
 * @returns S3 key path
 */
export function buildS3KeyPath(
	schoolName: string | null | undefined,
	schoolId: string | null | undefined,
	entityType: 'students' | 'nurses' | 'teachers' | 'admins' | 'courses' | 'discipline' | 'lesson-plans' | 'reports',
	folderType: 'profile-images' | 'transcripts' | 'documents' | 'outlines' | 'attachments' | 'generated',
	fileName: string
): string {
	// Sanitize school name for folder name (remove special chars, spaces become hyphens)
	const sanitizeSchoolName = (name: string): string => {
		return name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\s-]/g, '') // Remove special characters
			.replace(/\s+/g, '-') // Replace spaces with hyphens
			.replace(/-+/g, '-') // Replace multiple hyphens with single
			.replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
	};

	// Get school folder name (sanitized name + ID for uniqueness)
	let schoolFolder = 'default';
	if (schoolName && schoolId) {
		const sanitizedName = sanitizeSchoolName(schoolName);
		const shortId = schoolId.toString().substring(0, 8); // Use first 8 chars of ID
		schoolFolder = `${sanitizedName}-${shortId}`;
	} else if (schoolId) {
		schoolFolder = `school-${schoolId.toString().substring(0, 8)}`;
	}

	// Build path: schools/{school-folder}/{entity-type}/{folder-type}/{filename}
	return `schools/${schoolFolder}/${entityType}/${folderType}/${fileName}`;
}

/**
 * Ensure S3 folder structure exists (in S3, folders don't really exist, but we can create placeholder)
 * This is mainly for documentation - S3 creates folders automatically when files are uploaded
 * 
 * @param s3 - S3Client instance
 * @param bucket - S3 bucket name
 * @param keyPath - Full key path including folders
 */
export async function ensureS3FolderStructure(
	s3: S3Client,
	bucket: string,
	keyPath: string
): Promise<void> {
	// In S3, folders are created automatically when files are uploaded
	// But we can optionally create empty placeholder files for folder structure
	// This is optional and mainly for organizational purposes
	
	// Extract folder path from key (everything before last /)
	const pathParts = keyPath.split('/');
	if (pathParts.length <= 1) return; // No folders needed

	// For now, we'll just log - S3 will create folders automatically
	// If you want explicit folder creation, uncomment below:
	/*
	const folderPath = pathParts.slice(0, -1).join('/') + '/';
	try {
		// Try to check if folder marker exists
		await s3.send(new HeadObjectCommand({
			Bucket: bucket,
			Key: folderPath,
		}));
	} catch (error: any) {
		if (error.name === 'NotFound') {
			// Create folder marker (empty file with trailing slash)
			await s3.send(new PutObjectCommand({
				Bucket: bucket,
				Key: folderPath,
				Body: Buffer.from(''),
			}));
		}
	}
	*/
}

export async function uploadBufferToS3(
	s3: S3Client,
	bucket: string,
	key: string,
	body: Buffer,
	contentType: string,
	ensureFolders: boolean = true
): Promise<string> {
	// Ensure folder structure exists (optional - S3 creates folders automatically)
	if (ensureFolders) {
		await ensureS3FolderStructure(s3, bucket, key);
	}

	const command = new PutObjectCommand({
		Bucket: bucket,
		Key: key,
		Body: body,
		ContentType: contentType,
	});
	await s3.send(command);
	const region = process.env.AWS_REGION || 'us-east-1';
	return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export async function deleteFromS3(
	s3: S3Client,
	bucket: string,
	key: string
): Promise<void> {
	const command = new DeleteObjectCommand({
		Bucket: bucket,
		Key: key,
	});
	await s3.send(command);
}

export function buildS3PublicUrl(bucket: string, region: string, key: string): string {
	return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export function extractS3KeyFromUrl(url: string, bucket: string, region: string): string | null {
	try {
		if (!url) return null;
		const prefix = `https://${bucket}.s3.${region}.amazonaws.com/`;
		if (url.startsWith(prefix)) return url.substring(prefix.length);
		const idx = url.indexOf('.amazonaws.com/');
		if (idx !== -1) {
			return url.substring(idx + '.amazonaws.com/'.length + url.split('.amazonaws.com/')[0].length);
		}
		return null;
	} catch {
		return null;
	}
}
