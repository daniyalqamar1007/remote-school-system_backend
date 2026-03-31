import { MongoClient, ObjectId } from 'mongodb';

async function updateParentWithChildren() {
  const uri = 'mongodb+srv://123:123@e-store.uf5qztz.mongodb.net/srs';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const database = client.db('srs');
    const parentsCollection = database.collection('parents');
    const studentsCollection = database.collection('students');

    // Find your parent (by email)
    const parentEmail = 'parent@example.com';
    const parent = await parentsCollection.findOne({ email: parentEmail });

    if (!parent) {
      console.log('No parent found for:', parentEmail);
      return;
    }

    // Find students by studentId (or email, or whatever unique field)
    const student1 = await studentsCollection.findOne({ studentId: 'ST001' });
    const student2 = await studentsCollection.findOne({ studentId: 'ST002' });

    if (!student1 || !student2) {
      console.log('Students not found');
      return;
    }

    // Must use ObjectId fields!
    await parentsCollection.updateOne(
      { _id: parent._id },
      { $set: { children: [student1._id, student2._id] } }
    );

    console.log('Linked students to parent:', [student1._id, student2._id]);
  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

updateParentWithChildren().catch(console.error);