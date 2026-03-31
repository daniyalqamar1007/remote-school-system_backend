import * as mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define schemas directly without importing from AppModule
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'NURSE'], required: true },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
  isEmailVerified: { type: Boolean, default: false },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  studentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentProfile' },
  teacherProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'TeacherProfile' },
  parentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParentProfile' },
}, { timestamps: true });

const SchoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  type: { type: String, enum: ['PUBLIC', 'PRIVATE', 'CHARTER', 'INTERNATIONAL'], default: 'PUBLIC' },
  status: { type: String, enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], default: 'ACTIVE' },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
  },
  phone: String,
  email: String,
  establishedYear: Number,
  studentCapacity: Number,
  gradelevels: [String],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

/**
 * Simplified migration script that creates sample users for testing
 * This script creates fresh test accounts - it does NOT migrate existing data
 */
async function migrate() {
  console.log('Starting migration...');
  
  try {
    // Connect to MongoDB using environment variable
    const mongoUri = process.env.MONGODB_CONNECTION_URL || process.env.MONGO_URI;
    
    if (!mongoUri) {
      throw new Error('MongoDB connection string not found in environment variables');
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      retryWrites: true,
    } as any);
    console.log('Connected to MongoDB successfully');

    // Create models
    const User = mongoose.model('User', UserSchema);
    const School = mongoose.model('School', SchoolSchema);

    // Step 1: Create a default school if none exists
    let defaultSchool = await School.findOne();
    
    if (!defaultSchool) {
      console.log('Creating default school...');
      defaultSchool = await School.create({
        name: 'Default School',
        code: 'DEFAULT-001',
        type: 'PUBLIC',
        status: 'ACTIVE',
        address: {
          street: '123 Main St',
          city: 'Default City',
          state: 'Default State',
          zipCode: '12345',
          country: 'USA',
        },
        phone: '555-0123',
        email: 'admin@defaultschool.edu',
        establishedYear: 2000,
        studentCapacity: 1000,
        gradelevels: ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
        isActive: true,
      });
      console.log('Default school created:', defaultSchool._id);
    }

    // Step 2: Create Super Admin user if none exists
    const existingSuperAdmin = await User.findOne({ 
      $or: [
        { role: 'SUPER_ADMIN' },
        { email: 'superadmin@srs.com' }
      ]
    });
    
    if (!existingSuperAdmin) {
      console.log('Creating Super Admin user...');
      try {
        const hashedPassword = await bcrypt.hash('SuperAdmin123!', 12);
        
        await User.create({
          email: 'superadmin@srs.com',
          password: hashedPassword,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          isEmailVerified: true,
          schoolId: null, // Super admin doesn't belong to a specific school
        });
        console.log('Super Admin created with email: superadmin@srs.com');
      } catch (error: any) {
        if (error.code === 11000) {
          console.log('Super Admin already exists, skipping...');
        } else {
          throw error;
        }
      }
    } else {
      console.log('Super Admin already exists, skipping...');
    }

    // Step 3: Create Admin user for the default school
    const existingAdmin = await User.findOne({ 
      $or: [
        { role: 'ADMIN', schoolId: defaultSchool._id },
        { email: 'admin@defaultschool.edu' }
      ]
    });
    
    if (!existingAdmin) {
      console.log('Creating Admin user for default school...');
      try {
        const hashedPassword = await bcrypt.hash('Admin123!', 12);
        
        await User.create({
          email: 'admin@defaultschool.edu',
          password: hashedPassword,
          role: 'ADMIN',
          status: 'ACTIVE',
          isEmailVerified: true,
          schoolId: defaultSchool._id,
        });
        
        console.log('Admin created with email: admin@defaultschool.edu');
      } catch (error: any) {
        if (error.code === 11000) {
          console.log('Admin already exists, skipping...');
        } else {
          throw error;
        }
      }
    } else {
      console.log('Admin already exists, skipping...');
    }

    // Step 4: Create sample users for testing
    console.log('Creating sample users...');
    
    // Sample Teacher
    const teacherExists = await User.findOne({ email: 'teacher@defaultschool.edu' });
    if (!teacherExists) {
      const hashedPassword = await bcrypt.hash('Teacher123!', 12);
      await User.create({
        email: 'teacher@defaultschool.edu',
        password: hashedPassword,
        role: 'TEACHER',
        status: 'ACTIVE',
        isEmailVerified: true,
        schoolId: defaultSchool._id,
      });
      console.log('Sample teacher created');
    }

    // Sample Student
    const studentExists = await User.findOne({ email: 'student@defaultschool.edu' });
    if (!studentExists) {
      const hashedPassword = await bcrypt.hash('Student123!', 12);
      await User.create({
        email: 'student@defaultschool.edu',
        password: hashedPassword,
        role: 'STUDENT',
        status: 'ACTIVE',
        isEmailVerified: true,
        schoolId: defaultSchool._id,
      });
      console.log('Sample student created');
    }

    // Sample Parent
    const parentExists = await User.findOne({ email: 'parent@defaultschool.edu' });
    if (!parentExists) {
      const hashedPassword = await bcrypt.hash('Parent123!', 12);
      await User.create({
        email: 'parent@defaultschool.edu',
        password: hashedPassword,
        role: 'PARENT',
        status: 'ACTIVE',
        isEmailVerified: true,
        schoolId: defaultSchool._id,
      });
      console.log('Sample parent created');
    }

    // Sample Nurse
    const nurseExists = await User.findOne({ email: 'nurse@defaultschool.edu' });
    if (!nurseExists) {
      const hashedPassword = await bcrypt.hash('Nurse123!', 12);
      await User.create({
        email: 'nurse@defaultschool.edu',
        password: hashedPassword,
        role: 'NURSE',
        status: 'ACTIVE',
        isEmailVerified: true,
        schoolId: defaultSchool._id,
      });
      console.log('Sample nurse created');
    }

    console.log('\n=== Migration Complete ===');
    console.log('Sample login credentials:');
    console.log('Super Admin: superadmin@srs.com / SuperAdmin123!');
    console.log('Admin: admin@defaultschool.edu / Admin123!');
    console.log('Teacher: teacher@defaultschool.edu / Teacher123!');
    console.log('Student: student@defaultschool.edu / Student123!');
    console.log('Parent: parent@defaultschool.edu / Parent123!');
    console.log('Nurse: nurse@defaultschool.edu / Nurse123!');
    console.log('========================\n');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export { migrate };
