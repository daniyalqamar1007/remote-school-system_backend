const { MongoClient } = require('mongodb');

async function fixSchoolIndexes() {
  const client = new MongoClient('mongodb://localhost:27017');
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db('srs');
    const collection = db.collection('schools');
    
    // Check existing indexes
    console.log('Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}:`, index.key);
    });
    
    // Check if schoolCode index exists
    const schoolCodeIndex = indexes.find(idx => idx.key.schoolCode);
    if (schoolCodeIndex) {
      console.log('\nDropping schoolCode index...');
      await collection.dropIndex('schoolCode_1');
      console.log('✅ Dropped schoolCode index');
    } else {
      console.log('\n✅ No schoolCode index found');
    }
    
    // Check current schools and their field structure
    const schools = await collection.find({}).toArray();
    console.log(`\nFound ${schools.length} schools in database`);
    
    // Update any schools that have schoolCode field to use code field
    for (const school of schools) {
      if (school.schoolCode && !school.code) {
        console.log(`Migrating school: ${school.name} (${school.schoolCode} -> code)`);
        await collection.updateOne(
          { _id: school._id },
          { 
            $set: { code: school.schoolCode },
            $unset: { schoolCode: "" }
          }
        );
      } else if (school.schoolCode && school.code) {
        console.log(`Removing duplicate schoolCode field from: ${school.name}`);
        await collection.updateOne(
          { _id: school._id },
          { $unset: { schoolCode: "" } }
        );
      }
    }
    
    // Ensure proper indexes exist
    console.log('\nEnsuring proper indexes...');
    await collection.createIndex({ code: 1 }, { unique: true });
    await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
    
    console.log('✅ School indexes fixed successfully');
    
    // Show final state
    console.log('\nFinal indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}:`, index.key);
    });
    
  } catch (error) {
    console.error('❌ Error fixing indexes:', error);
  } finally {
    await client.close();
  }
}

fixSchoolIndexes();
