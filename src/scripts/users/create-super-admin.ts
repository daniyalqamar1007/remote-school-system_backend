import * as dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import * as bcrypt from 'bcryptjs';

// Load environment variables
dotenv.config({ path: '.env' });

const MONGODB_URI = process.env.MONGODB_CONNECTION_URL || 'mongodb://localhost:27017/srs';
const SUPER_ADMIN_EMAIL = 'admin@srs.com';
const SUPER_ADMIN_PASSWORD = 'srs78654';

async function createSuperAdmin() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//***:***@'));

    const db = client.db();
    const usersCollection = db.collection('users');

    // Check if Super Admin already exists
    const existingSuperAdmin = await usersCollection.findOne({
      email: SUPER_ADMIN_EMAIL.toLowerCase()
    });

    if (existingSuperAdmin) {
      console.log('⚠️  Super Admin already exists with email:', SUPER_ADMIN_EMAIL);
      console.log('   Updating password...');
      
      // Update password
      const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
      await usersCollection.updateOne(
        { email: SUPER_ADMIN_EMAIL.toLowerCase() },
        {
          $set: {
            password: hashedPassword,
            mustChangePassword: false,
            passwordLastChanged: new Date(),
            updatedAt: new Date()
          }
        }
      );
      
      console.log('✅ Super Admin password updated successfully!');
      console.log('\n📧 Login credentials:');
      console.log(`   Email: ${SUPER_ADMIN_EMAIL}`);
      console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`);
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);

    // Create Super Admin user according to User schema
    const superAdmin = {
      email: SUPER_ADMIN_EMAIL.toLowerCase(),
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Administrator',
      role: 'SUPER_ADMIN', // Using UserRole enum value
      status: 'ACTIVE',
      schoolId: null, // Super admin is not tied to a specific school
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
      // Optional fields
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

    const result = await usersCollection.insertOne(superAdmin);
    console.log('✅ Super Admin created successfully!');
    console.log(`   User ID: ${result.insertedId}`);
    console.log('\n📧 Login credentials:');
    console.log(`   Email: ${SUPER_ADMIN_EMAIL}`);
    console.log(`   Password: ${SUPER_ADMIN_PASSWORD}`);
    console.log(`   Role: SUPER_ADMIN`);
    console.log('\n🌐 You can now login at: http://localhost:3000/login');

  } catch (error: any) {
    console.error('❌ Error creating Super Admin:', error.message);
    if (error.code === 11000) {
      console.error('   Duplicate key error - user might already exist');
    }
    throw error;
  } finally {
    await client.close();
    console.log('\n🔌 Database connection closed');
  }
}

// Execute the function
createSuperAdmin()
  .then(() => {
    console.log('\n🎉 Super Admin setup completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Failed to create Super Admin:', error);
    process.exit(1);
  });



