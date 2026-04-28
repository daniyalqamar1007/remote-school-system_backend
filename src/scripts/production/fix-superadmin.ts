import * as mongoose from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define schema (simplified)
const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: String,
  status: String,
  isEmailVerified: Boolean,
  schoolId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });

async function fixSuperAdmin() {
  console.log('Fixing superadmin password...');
  
  try {
    // Connect to MongoDB
    const mongoUri =
      process.env.MONGO_URI ||
      process.env.MONGODB_CONNECTION_URL ||
      'mongodb://localhost:27017/srs';
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully');

    // Create model
    const User = mongoose.model('User', UserSchema);

    // Find the superadmin user
    const superAdmin = await User.findOne({ email: 'superadmin@srs.com' });
    
    if (!superAdmin) {
      console.log('Superadmin user not found!');
      return;
    }

    console.log('Current superadmin user:', {
      email: superAdmin.email,
      role: superAdmin.role,
      status: superAdmin.status,
      hasPassword: !!superAdmin.password
    });

    // Hash the correct password
    const correctPassword = 'Superadmin123!';
    const hashedPassword = await bcrypt.hash(correctPassword, 12);

    // Update the user
    await User.updateOne(
      { email: 'superadmin@srs.com' },
      {
        password: hashedPassword,
        role: 'SUPER_ADMIN', // Fix the role too
        status: 'ACTIVE',
        isEmailVerified: true
      }
    );

    console.log('✅ Superadmin user updated successfully!');
    console.log('Updated credentials:');
    console.log('Email: superadmin@srs.com');
    console.log('Password: Superadmin123!');
    console.log('Role: SUPER_ADMIN');
    console.log('Status: ACTIVE');

  } catch (error) {
    console.error('❌ Error fixing superadmin:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the fix
fixSuperAdmin().then(() => {
  console.log('Fix completed');
  process.exit(0);
}).catch((error) => {
  console.error('Fix failed:', error);
  process.exit(1);
});
