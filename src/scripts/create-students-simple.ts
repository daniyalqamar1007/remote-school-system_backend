import { MongoClient, ObjectId } from 'mongodb';
import * as bcrypt from 'bcrypt';

async function createStudentsForParent() {
  const uri = 'mongodb+srv://daniyalqamar1007:9myDVVPAajTYvJi3@srscluster.hiluyui.mongodb.net/srs';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("🔗 Connected to MongoDB");

    const database = client.db('srs');
    const studentsCollection = database.collection('students');
    const parentsCollection = database.collection('parents');
    
    // Find the parent
    const parent = await parentsCollection.findOne({ email: 'parent@defaultschool.edu' });
    if (!parent) {
      console.log('❌ Parent not found!');
      return;
    }
    
    console.log('✅ Found parent:', parent._id);
    
    // Create students
    const student1 = {
      firstName: 'Emma',
      lastName: 'Smith',
      studentId: 'ST1319',
      email: 'emma.smith@defaultschool.edu',
      phone: '555-0101',
      dob: new Date('2008-03-15'),
      address: '123 Main St, City, State 12345',
      class: '10',
      section: 'A',
      enrollDate: new Date('2023-08-15'),
      expectedGraduation: new Date('2026-06-15'),
      emergencyContact: '555-0199',
      profilePhoto: 'N/A',
      parents: [parent._id],
      status: 'ACTIVE',
      academicYear: '2024-2025'
    };
    
    const student2 = {
      firstName: 'Liam',
      lastName: 'Smith',
      studentId: 'ST5186',
      email: 'liam.smith@defaultschool.edu',
      phone: '555-0102',
      dob: new Date('2010-07-22'),
      address: '123 Main St, City, State 12345',
      class: '8',
      section: 'B',
      enrollDate: new Date('2023-08-15'),
      expectedGraduation: new Date('2028-06-15'),
      emergencyContact: '555-0199',
      profilePhoto: 'N/A',
      parents: [parent._id],
      status: 'ACTIVE',
      academicYear: '2024-2025'
    };
    
    // Check if students already exist
    const existingStudent1 = await studentsCollection.findOne({ studentId: 'ST1319' });
    const existingStudent2 = await studentsCollection.findOne({ studentId: 'ST5186' });
    
    let student1Id, student2Id;
    
    if (existingStudent1) {
      console.log('✅ Student Emma already exists');
      student1Id = existingStudent1._id;
      // Update parent reference
      await studentsCollection.updateOne(
        { _id: student1Id },
        { $set: { parents: [parent._id] } }
      );
    } else {
      const result1 = await studentsCollection.insertOne(student1);
      student1Id = result1.insertedId;
      console.log('✅ Created student Emma:', student1Id);
    }
    
    if (existingStudent2) {
      console.log('✅ Student Liam already exists');
      student2Id = existingStudent2._id;
      // Update parent reference
      await studentsCollection.updateOne(
        { _id: student2Id },
        { $set: { parents: [parent._id] } }
      );
    } else {
      const result2 = await studentsCollection.insertOne(student2);
      student2Id = result2.insertedId;
      console.log('✅ Created student Liam:', student2Id);
    }
    
    // Update parent with children references
    const updateResult = await parentsCollection.updateOne(
      { _id: parent._id },
      { $set: { children: [student1Id, student2Id] } }
    );
    
    console.log('✅ Updated parent with children:', updateResult.modifiedCount);
    
    // Verify the linking
    const updatedParent = await parentsCollection.findOne({ _id: parent._id });
    console.log('🔍 Final parent state:', {
      email: updatedParent?.email,
      childrenCount: updatedParent?.children?.length || 0,
      children: updatedParent?.children
    });
    
    const students = await studentsCollection.find({ 
      _id: { $in: updatedParent?.children || [] } 
    }).toArray();
    
    console.log('👨‍🎓 Children details:');
    students.forEach((student: any) => {
      console.log(`   - ${student.firstName} ${student.lastName} (${student.studentId})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

createStudentsForParent();
