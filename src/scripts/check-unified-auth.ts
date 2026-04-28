import { MongoClient } from 'mongodb';

async function checkUnifiedAuthSystem() {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_CONNECTION_URL ||
    'mongodb://localhost:27017/srs';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("🔗 Connected to MongoDB");

    const database = client.db('srs');
    
    // Check what collections exist
    const collections = await database.listCollections().toArray();
    console.log('\n📊 Available collections:');
    collections.forEach(col => console.log(`   - ${col.name}`));
    
    // Check the unified users table
    const usersCollection = database.collection('users');
    const userCount = await usersCollection.countDocuments();
    console.log(`\n👥 Total users: ${userCount}`);
    
    // Find our authenticated user
    console.log('\n🔍 Looking for authenticated user: 68b3672cc65b73b7433e9265');
    const { ObjectId } = require('mongodb');
    const authUser = await usersCollection.findOne({ _id: new ObjectId('68b3672cc65b73b7433e9265') });
    console.log('Authenticated user found:', !!authUser);
    
    if (authUser) {
      console.log('User details:', {
        _id: authUser._id,
        email: authUser.email,
        role: authUser.role,
        firstName: authUser.firstName,
        lastName: authUser.lastName
      });
    }
    
    // Find parent@defaultschool.edu in users table
    console.log('\n🔍 Looking for parent@defaultschool.edu in users table');
    const parentUser = await usersCollection.findOne({ email: 'parent@defaultschool.edu' });
    console.log('Parent user found:', !!parentUser);
    
    if (parentUser) {
      console.log('Parent user details:', {
        _id: parentUser._id,
        email: parentUser.email,
        role: parentUser.role,
        firstName: parentUser.firstName,
        lastName: parentUser.lastName
      });
    }
    
    // Check if ParentProfile collection exists
    const parentProfilesCollection = database.collection('parentprofiles');
    const parentProfileCount = await parentProfilesCollection.countDocuments();
    console.log(`\n👨‍👩‍👧‍👦 ParentProfile documents: ${parentProfileCount}`);
    
    if (parentProfileCount > 0) {
      const sampleParentProfiles = await parentProfilesCollection.find({}).limit(3).toArray();
      console.log('Sample parent profiles:');
      sampleParentProfiles.forEach((profile: any) => {
        console.log(`   - UserId: ${profile.userId}, Children: ${profile.children?.length || 0}`);
      });
    }
    
    // Check StudentProfile collection
    const studentProfilesCollection = database.collection('studentprofiles');
    const studentProfileCount = await studentProfilesCollection.countDocuments();
    console.log(`\n🎓 StudentProfile documents: ${studentProfileCount}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

checkUnifiedAuthSystem();
