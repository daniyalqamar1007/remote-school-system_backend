import * as dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import * as bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config({ path: '.env' });

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_CONNECTION_URL || 'mongodb://localhost:27017/srs';
const TEACHER_EMAIL = (process.env.TEACHER_EMAIL || 'teacher@rms.local').toLowerCase();
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD || 'Teacher123!';
const TEACHER_FIRST_NAME = process.env.TEACHER_FIRST_NAME || 'John';
const TEACHER_LAST_NAME = process.env.TEACHER_LAST_NAME || 'Teacher';
const TEACHER_PHONE = process.env.TEACHER_PHONE || '+1-555-1002';
const TEACHER_SUBJECT = process.env.TEACHER_SUBJECT || 'Mathematics';
const TEACHER_SPECIALIZATION = process.env.TEACHER_SPECIALIZATION || 'Algebra';
const TEACHER_EXPERIENCE_YEARS = process.env.TEACHER_EXPERIENCE_YEARS || '5';
const TEACHER_DEPARTMENT = process.env.TEACHER_DEPARTMENT || 'Academics';
const TEACHER_SCHOOL_ID = process.env.TEACHER_SCHOOL_ID || null;

function resolveSchoolId(value: string | null): ObjectId | null {
  if (!value) {
    return null;
  }

  if (!ObjectId.isValid(value)) {
    throw new Error('TEACHER_SCHOOL_ID is not a valid ObjectId');
  }

  return new ObjectId(value);
}

async function createTeacher() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));

    const db = client.db();
    const usersCollection = db.collection('users');
    const schoolId = resolveSchoolId(TEACHER_SCHOOL_ID);

    const existingTeacher = await usersCollection.findOne({ email: TEACHER_EMAIL });

    if (existingTeacher) {
      console.log('Teacher already exists with email:', TEACHER_EMAIL);
      console.log('Updating password and core fields...');

      const hashedPassword = await bcrypt.hash(TEACHER_PASSWORD, 12);
      await usersCollection.updateOne(
        { email: TEACHER_EMAIL },
        {
          $set: {
            password: hashedPassword,
            firstName: TEACHER_FIRST_NAME,
            lastName: TEACHER_LAST_NAME,
            role: 'TEACHER',
            status: 'ACTIVE',
            schoolId,
            phone: TEACHER_PHONE,
            subject: TEACHER_SUBJECT,
            specialization: TEACHER_SPECIALIZATION,
            experienceYears: TEACHER_EXPERIENCE_YEARS,
            department: TEACHER_DEPARTMENT,
            isActive: true,
            isEmailVerified: true,
            mustChangePassword: false,
            passwordLastChanged: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      console.log('Teacher updated successfully');
      console.log(`Email: ${TEACHER_EMAIL}`);
      console.log(`Password: ${TEACHER_PASSWORD}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(TEACHER_PASSWORD, 12);

    const teacherUser = {
      email: TEACHER_EMAIL,
      password: hashedPassword,
      firstName: TEACHER_FIRST_NAME,
      lastName: TEACHER_LAST_NAME,
      role: 'TEACHER',
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
      phone: TEACHER_PHONE,
      subject: TEACHER_SUBJECT,
      specialization: TEACHER_SPECIALIZATION,
      experienceYears: TEACHER_EXPERIENCE_YEARS,
      department: TEACHER_DEPARTMENT,
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

    const result = await usersCollection.insertOne(teacherUser);
    console.log('Teacher created successfully');
    console.log(`User ID: ${result.insertedId}`);
    console.log(`Email: ${TEACHER_EMAIL}`);
    console.log(`Password: ${TEACHER_PASSWORD}`);
    console.log('Role: TEACHER');
  } catch (error: any) {
    console.error('Error creating Teacher:', error.message);
    throw error;
  } finally {
    await client.close();
    console.log('Database connection closed');
  }
}

createTeacher()
  .then(() => {
    console.log('Teacher setup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to create Teacher:', error);
    process.exit(1);
  });
