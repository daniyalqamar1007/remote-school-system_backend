import { MongoClient, ObjectId } from 'mongodb';
import * as bcrypt from 'bcrypt';

async function seedStudents() {
  const uri = 'mongodb+srv://123:123@e-store.uf5qztz.mongodb.net/srs';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("Connected to MongoDB");

    const database = client.db('srs');
    const studentsCollection = database.collection('students');

    // Hash a default password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash('123', salt);

    // Prepare students
    const students = [
      {
        studentId: 'ST001',
        firstName: 'Emma',
        lastName: 'Johnson',
        class: '9',
        section: 'A',
        gender: 'Female',
        dob: '2009-05-15',
        email: 'emma.johnson@student.example.com',
        phone: '555-111-1111',
        address: '123 Main Street, Anytown, USA',
        emergencyContact: '555-999-9999',
        enrollDate: '2022-09-01',
        expectedGraduation: '2026-06-15',
        password: hashedPassword,
        guardian: null, // Optionally link Guardian _id
        profilePhoto: '/students/student1.jpg',
        transcripts: [],
        iipFlag: false,
        honorRolls: false,
        athletics: false,
        clubs: '',
        lunch: '',
        nationality: 'American',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        studentId: 'ST002',
        firstName: 'Liam',
        lastName: 'Johnson',
        class: '7',
        section: 'B',
        gender: 'Male',
        dob: '2011-03-22',
        email: 'liam.johnson@student.example.com',
        phone: '555-222-2222',
        address: '123 Main Street, Anytown, USA',
        emergencyContact: '555-999-9999',
        enrollDate: '2023-09-01',
        expectedGraduation: '2028-06-15',
        password: hashedPassword,
        guardian: null,
        profilePhoto: '/students/student2.jpg',
        transcripts: [],
        iipFlag: false,
        honorRolls: false,
        athletics: false,
        clubs: '',
        lunch: '',
        nationality: 'American',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    // Check if already exists (by studentId)
    for (const student of students) {
      const existing = await studentsCollection.findOne({ studentId: student.studentId });
      if (existing) {
        console.log(`Student ${student.studentId} already exists:`, existing._id);
      } else {
        const result = await studentsCollection.insertOne(student);
        console.log(`Inserted student ${student.studentId}:`, result.insertedId);
      }
    }

    // Print all students for reference:
    const allStudents = await studentsCollection.find({}).toArray();
    console.log('All students:', allStudents.map(s => ({ id: s._id, studentId: s.studentId, name: s.firstName + ' ' + s.lastName })));

  } finally {
    await client.close();
    console.log("MongoDB connection closed");
  }
}

seedStudents().catch(console.error);