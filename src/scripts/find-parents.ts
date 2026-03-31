import { MongoClient } from 'mongodb';

async function findParentsByEmail() {
  const uri = 'mongodb+srv://daniyalqamar1007:9myDVVPAajTYvJi3@srscluster.hiluyui.mongodb.net/srs';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('🔗 Connected to MongoDB');
    
    const database = client.db('srs');
    const parentsCollection = database.collection('parents');
    
    console.log('🔍 Finding all parents with email: parent@defaultschool.edu');
    const parents = await parentsCollection.find({ email: 'parent@defaultschool.edu' }).toArray();
    
    console.log(`Found ${parents.length} parent(s):`);
    parents.forEach((p: any) => {
      console.log({
        _id: p._id,
        email: p.email,
        firstName: p.firstName,
        lastName: p.lastName,
        childrenCount: p.children?.length || 0,
        children: p.children || []
      });
    });
    
    if (parents.length === 0) {
      console.log('\n❌ No parents found with this email!');
      console.log('🔍 Let me check what parents exist:');
      const allParents = await parentsCollection.find({}).limit(10).toArray();
      console.log('Sample parents in database:');
      allParents.forEach((p: any) => {
        console.log(`   - ${p.email} (${p._id})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

findParentsByEmail();
