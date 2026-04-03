import * as dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import * as bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config({ path: '.env' });

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_CONNECTION_URL || 'mongodb://localhost:27017/srs';
const PARENT_EMAIL = (process.env.PARENT_EMAIL || 'parent@rms.local').toLowerCase();
const PARENT_PASSWORD = process.env.PARENT_PASSWORD || 'Parent123!';
const PARENT_FIRST_NAME = process.env.PARENT_FIRST_NAME || 'Jane';
const PARENT_LAST_NAME = process.env.PARENT_LAST_NAME || 'Parent';
const PARENT_PHONE = process.env.PARENT_PHONE || '+1-555-1004';
const PARENT_SCHOOL_ID = process.env.PARENT_SCHOOL_ID || null;

function resolveSchoolId(value: string | null): ObjectId | null {
  if (!value) {
    return null;
  }

  if (!ObjectId.isValid(value)) {
    throw new Error('PARENT_SCHOOL_ID is not a valid ObjectId');
  }

  return new ObjectId(value);
}

async function createParent() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));

    const db = client.db();
    const usersCollection = db.collection('users');
    const schoolId = resolveSchoolId(PARENT_SCHOOL_ID);

    const existingParent = await usersCollection.findOne({ email: PARENT_EMAIL });

    if (existingParent) {
      console.log('Parent already exists with email:', PARENT_EMAIL);
      console.log('Updating password and core fields...');

      const hashedPassword = await bcrypt.hash(PARENT_PASSWORD, 12);
      await usersCollection.updateOne(
        { email: PARENT_EMAIL },
        {
          $set: {
            password: hashedPassword,
            firstName: PARENT_FIRST_NAME,
            lastName: PARENT_LAST_NAME,
            role: 'PARENT',
            status: 'ACTIVE',
            schoolId,
            phone: PARENT_PHONE,
            isActive: true,
            isEmailVerified: true,
            mustChangePassword: false,
            passwordLastChanged: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      console.log('Parent updated successfully');
      console.log(`Email: ${PARENT_EMAIL}`);
      console.log(`Password: ${PARENT_PASSWORD}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(PARENT_PASSWORD, 12);

    const parentUser = {
      email: PARENT_EMAIL,
      password: hashedPassword,
      firstName: PARENT_FIRST_NAME,
      lastName: PARENT_LAST_NAME,
      role: 'PARENT',
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
      phone: PARENT_PHONE,
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

    const result = await usersCollection.insertOne(parentUser);
    console.log('Parent created successfully');
    console.log(`User ID: ${result.insertedId}`);
    console.log(`Email: ${PARENT_EMAIL}`);
    console.log(`Password: ${PARENT_PASSWORD}`);
    console.log('Role: PARENT');
  } catch (error: any) {
    console.error('Error creating Parent:', error.message);
    throw error;
  } finally {
    await client.close();
    console.log('Database connection closed');
  }
}

createParent()
  .then(() => {
    console.log('Parent setup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to create Parent:', error);
    process.exit(1);
  });
