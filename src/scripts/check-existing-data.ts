import { MongoClient } from 'mongodb';

async function checkExistingData() {
  const uri = 'mongodb+srv://daniyalqamar1007:9myDVVPAajTYvJi3@srscluster.hiluyui.mongodb.net/srs';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("🔗 Connected to MongoDB");

    const database = client.db('srs');
    const studentsCollection = database.collection('students');
    const parentsCollection = database.collection('parents');
    
    // Check existing students
    const studentCount = await studentsCollection.countDocuments();
    console.log(`📊 Total students: ${studentCount}`);
    
    if (studentCount > 0) {
      const sampleStudents = await studentsCollection.find({}).limit(3).toArray();
      console.log('\n📝 Sample students:');
      sampleStudents.forEach((student: any) => {
        console.log(`   - ${student.firstName} ${student.lastName} (ID: ${student.studentId}, Email: ${student.email})`);
      });
      
      // Check for rollNumber field
      const studentWithRollNumber = await studentsCollection.findOne({ rollNumber: { $exists: true } });
      if (studentWithRollNumber) {
        console.log('\n🆔 Found student with rollNumber:', studentWithRollNumber.rollNumber);
      } else {
        console.log('\n❌ No students have rollNumber field');
      }
    }
    
    // Check our target parent
    const parent = await parentsCollection.findOne({ email: 'parent@defaultschool.edu' });
    if (parent) {
      console.log('\n👨‍👩‍👧‍👦 Target parent:', {
        _id: parent._id,
        email: parent.email,
        children: parent.children || [],
        childrenCount: parent.children?.length || 0
      });
      
      // Check if parent already has children
      if (parent.children && parent.children.length > 0) {
        const children = await studentsCollection.find({
          _id: { $in: parent.children }
        }).toArray();
        
        console.log('\n👶 Existing children:');
        children.forEach((child: any) => {
          console.log(`   - ${child.firstName} ${child.lastName} (${child.studentId})`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

checkExistingData();
