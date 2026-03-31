const mongoose = require('mongoose');
require('dotenv').config();

async function updateUserNames() {
  try {
    const mongoUri = process.env.MONGODB_CONNECTION_URL || process.env.MONGO_URI;
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected successfully');

    const db = mongoose.connection.db;
    const users = db.collection('users');

    // Get all users
    const allUsers = await users.find({}).toArray();
    console.log(`📊 Found ${allUsers.length} users to update`);

    for (const user of allUsers) {
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

      const result = await users.updateOne(
        { _id: user._id },
        {
          $set: {
            firstName: firstName,
            lastName: lastName
          }
        }
      );

      console.log(`✅ Updated ${user.email}: ${firstName} ${lastName}`);
    }

    console.log('🎉 All users updated successfully!');
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateUserNames();
