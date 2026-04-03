import * as dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';
import * as bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config({ path: '.env' });

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_CONNECTION_URL || 'mongodb://localhost:27017/srs';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@rms.local').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const ADMIN_FIRST_NAME = process.env.ADMIN_FIRST_NAME || 'School';
const ADMIN_LAST_NAME = process.env.ADMIN_LAST_NAME || 'Admin';
const ADMIN_SCHOOL_ID = process.env.ADMIN_SCHOOL_ID || null;

function resolveSchoolId(value: string | null): ObjectId | null {
  if (!value) {
    return null;
  }

  if (!ObjectId.isValid(value)) {
    throw new Error('ADMIN_SCHOOL_ID is not a valid ObjectId');
  }

  return new ObjectId(value);
}

async function createAdmin() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));

    const db = client.db();
    const usersCollection = db.collection('users');
    const schoolId = resolveSchoolId(ADMIN_SCHOOL_ID);

    const existingAdmin = await usersCollection.findOne({ email: ADMIN_EMAIL });

    if (existingAdmin) {
      console.log('Admin already exists with email:', ADMIN_EMAIL);
      console.log('Updating password and core fields...');

      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await usersCollection.updateOne(
        { email: ADMIN_EMAIL },
        {
          $set: {
            password: hashedPassword,
            firstName: ADMIN_FIRST_NAME,
            lastName: ADMIN_LAST_NAME,
            role: 'ADMIN',
            status: 'ACTIVE',
            schoolId,
            isActive: true,
            isEmailVerified: true,
            mustChangePassword: false,
            passwordLastChanged: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      console.log('Admin updated successfully');
      console.log(`Email: ${ADMIN_EMAIL}`);
      console.log(`Password: ${ADMIN_PASSWORD}`);
      return;
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    const adminUser = {
      email: ADMIN_EMAIL,
      password: hashedPassword,
      firstName: ADMIN_FIRST_NAME,
      lastName: ADMIN_LAST_NAME,
      role: 'ADMIN',
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
      phone: null,
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

    const result = await usersCollection.insertOne(adminUser);
    console.log('Admin created successfully');
    console.log(`User ID: ${result.insertedId}`);
    console.log(`Email: ${ADMIN_EMAIL}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log('Role: ADMIN');
  } catch (error: any) {
    console.error('Error creating Admin:', error.message);
    throw error;
  } finally {
    await client.close();
    console.log('Database connection closed');
  }
}

createAdmin()
  .then(() => {
    console.log('Admin setup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed to create Admin:', error);
    process.exit(1);
  });
