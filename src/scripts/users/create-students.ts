import * as dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import * as bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config({ path: '.env' });

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_CONNECTION_URL || 'mongodb://localhost:27017/srs';
const STUDENT_EMAIL = (process.env.STUDENT_EMAIL || 'student@rms.local').toLowerCase();
const STUDENT_PASSWORD = process.env.STUDENT_PASSWORD || 'Student123!';
const STUDENT_FIRST_NAME = process.env.STUDENT_FIRST_NAME || 'Alex';
const STUDENT_LAST_NAME = process.env.STUDENT_LAST_NAME || 'Student';
const STUDENT_PHONE = process.env.STUDENT_PHONE || '+1-555-1003';
const STUDENT_GRADE_LEVEL = process.env.STUDENT_GRADE_LEVEL || '10';
const STUDENT_SECTION = process.env.STUDENT_SECTION || 'A';
const STUDENT_SCHOOL_ID = process.env.STUDENT_SCHOOL_ID || null;

function resolveSchoolId(value: string | null): ObjectId | null {
  if (!value) {
    return null;
  }

  if (!ObjectId.isValid(value)) {
    throw new Error('STUDENT_SCHOOL_ID is not a valid ObjectId');
  }

  return new ObjectId(value);
}

async function createStudent() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));

    const db = client.db();
    const usersCollection = db.collection('users');
    const schoolId = resolveSchoolId(STUDENT_SCHOOL_ID);

    const existingStudent = await usersCollection.findOne({ email: STUDENT_EMAIL });

    if (existingStudent) {
      console.log('Student already exists with email:', STUDENT_EMAIL);
      console.log('Updating password and core fields...');

      const hashedPassword = await bcrypt.hash(STUDENT_PASSWORD, 12);
      await usersCollection.updateOne(
        { email: STUDENT_EMAIL },
        {
          $set: {
            password: hashedPassword,
            firstName: STUDENT_FIRST_NAME,
            lastName: STUDENT_LAST_NAME,
            role: 'STUDENT',
            status: 'ACTIVE',
            schoolId,
            phone: STUDENT_PHONE,
            gradeLevel: STUDENT_GRADE_LEVEL,
            section: STUDENT_SECTION,
            isActive: true,
            isEmailVerified: true,
            mustChangePassword: false,
            passwordLastChanged: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      console.log('Student updated successfully');
      console.log(`Email: ${STUDENT_EMAIL}`);
      console.log(`Password: ${STUDENT_PASSWORD}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(STUDENT_PASSWORD, 12);

    const studentUser = {
      email: STUDENT_EMAIL,
      password: hashedPassword,
      firstName: STUDENT_FIRST_NAME,
      lastName: STUDENT_LAST_NAME,
      role: 'STUDENT',
      status: 'ACTIVE',
      schoolId,
      isActive: true,
      isEmailVerified: true,
      mustChangePassword: false,
      passwordLastChanged: new Date(),
      failedLoginAttempts: 0,
      lockoutUntil: null,
      lastLogin: null,
      lastSeen: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      phone: STUDENT_PHONE,
      gradeLevel: STUDENT_GRADE_LEVEL,
      section: STUDENT_SECTION,
      address: null,
      dateOfBirth: null,
      gender: null,
      profilePicture: null,
      nationality: null,
      refreshTokens: [],
      passwordResetToken: null,
      passwordResetExpires: null,
      emailVerificationToken: null,
      emailVerificationExpires: null,
      passwordExpiry: null,
      accountLocked: false,
      mfaEnabled: false,
      mfaSecret: null,
      mfaTempCode: null,
      mfaTempCodeExpiry: null,
      previousPasswords: [],
      createdBy: null,
      updatedBy: null,
    };

    const result = await usersCollection.insertOne(studentUser);
    console.log('Student created successfully');
    console.log(`User ID: ${result.insertedId}`);
    console.log(`Email: ${STUDENT_EMAIL}`);
    console.log(`Password: ${STUDENT_PASSWORD}`);
    console.log('Role: STUDENT');
  } catch (error: any) {
    console.error('Error creating Student:', error.message);
    throw error;
  } finally {
    await client.close();
    console.log('Database connection closed');
  }
}

createStudent()
  .then(() => {
    console.log('Student setup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to create Student:', error);
    process.exit(1);
  });
