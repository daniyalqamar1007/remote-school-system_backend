const mongoose = require('mongoose');
require('dotenv').config();

const UserSchema = new mongoose.Schema({
  email: String,
  firstName: String,
  lastName: String,
  role: String,
}, { timestamps: true });

async function verifyUserNames() {
  try {
    const mongoUri = process.env.MONGODB_CONNECTION_URL || process.env.MONGO_URI;
    
    console.log('🔍 Connecting to MongoDB to verify user names...');
    await mongoose.connect(mongoUri);
    
    const User = mongoose.model('User', UserSchema);
    
    // Get all users and check their names
    const users = await User.find({}, 'email firstName lastName role').exec();
    
    console.log('\n📋 User Names Verification:');
    console.log('='*50);
    
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Name: ${user.firstName || 'NOT_SET'} ${user.lastName || 'NOT_SET'}`);
      console.log('');
    });
    
    const missingNames = users.filter(u => !u.firstName || !u.lastName);
    
    if (missingNames.length > 0) {
      console.log(`⚠️  ${missingNames.length} users still missing names:`, missingNames.map(u => u.email));
    } else {
      console.log('✅ All users have names set!');
    }
    
    await mongoose.disconnect();
    console.log('✅ Verification completed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verifyUserNames();
