import * as mongoose from 'mongoose';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define schema (simplified)
const UserSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: String,
  status: String,
  firstName: String,
  lastName: String,
  isEmailVerified: Boolean,
  schoolId: mongoose.Schema.Types.ObjectId,
}, { timestamps: true });

async function addUserNames() {
  console.log('Adding first and last names to existing users...');
  
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_CONNECTION_URL || process.env.MONGO_URI;
    
    if (!mongoUri) {
      throw new Error('MongoDB connection string not found in environment variables');
    }
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully');

    // Create model
    const User = mongoose.model('User', UserSchema);

    // Find all users without firstName or lastName
    const usersToUpdate = await User.find({
      $or: [
        { firstName: { $exists: false } },
        { lastName: { $exists: false } },
        { firstName: { $eq: null } },
        { lastName: { $eq: null } }
      ]
    });

    console.log(`Found ${usersToUpdate.length} users to update`);

    for (const user of usersToUpdate) {
      // Extract name from email
      const emailPrefix = user.email.split('@')[0];
      
      let firstName = 'User';
      let lastName = 'Unknown';
      
      if (user.email === 'superadmin@srs.com') {
        firstName = 'Super';
        lastName = 'Admin';
      } else if (user.role === 'ADMIN') {
        firstName = 'School';
        lastName = 'Admin';
      } else if (user.role === 'TEACHER') {
        firstName = 'Teacher';
        lastName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      } else if (user.role === 'STUDENT') {
        firstName = 'Student';
        lastName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      } else if (user.role === 'PARENT') {
        firstName = 'Parent';
        lastName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      } else if (user.role === 'NURSE') {
        firstName = 'Nurse';
        lastName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
      } else if (emailPrefix.includes('.')) {
        const nameParts = emailPrefix.split('.');
        firstName = nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1);
        lastName = nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1);
      } else {
        firstName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
        lastName = 'User';
      }

      // Update the user
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            firstName: firstName,
            lastName: lastName
          }
        }
      );

      console.log(`Updated user ${user.email}: ${firstName} ${lastName}`);
    }

    console.log('✅ All users updated successfully!');

  } catch (error) {
    console.error('❌ Error updating users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the update
addUserNames().then(() => {
  console.log('Update completed');
  process.exit(0);
}).catch((error) => {
  console.error('Update failed:', error);
  process.exit(1);
});
