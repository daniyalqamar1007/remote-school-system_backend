import { MongoClient, ObjectId } from 'mongodb';

async function setupUnifiedAuthParentChild() {
  const uri = 'mongodb+srv://daniyalqamar1007:9myDVVPAajTYvJi3@srscluster.hiluyui.mongodb.net/srs';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("🔗 Connected to MongoDB");

    const database = client.db('srs');
    const usersCollection = database.collection('users');
    const parentProfilesCollection = database.collection('parentprofiles');
    const studentProfilesCollection = database.collection('studentprofiles');
    
    // Get the authenticated parent user
    const parentUserId = new ObjectId('68b3672cc65b73b7433e9265');
    const parentUser = await usersCollection.findOne({ _id: parentUserId });
    
    if (!parentUser) {
      console.log('❌ Parent user not found');
      return;
    }
    
    console.log('✅ Found parent user:', {
      _id: parentUser._id,
      email: parentUser.email,
      role: parentUser.role
    });
    
    // Create ParentProfile
    console.log('\n📝 Creating ParentProfile...');
    const parentProfile = {
      firstName: 'John',
      lastName: 'Smith',
      middleName: '',
      gender: 'Male',
      dateOfBirth: new Date('1980-05-15'),
      address: {
        street: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zipCode: '12345',
        country: 'USA'
      },
      phone: '555-0123',
      alternatePhone: '555-0124',
      occupation: 'Software Engineer',
      employer: 'Tech Corp',
      workPhone: '555-0125',
      children: [], // Will be updated after creating students
      emergencyContact: {
        name: 'Jane Smith',
        relationship: 'Spouse',
        phone: '555-0126'
      },
      preferredContactMethod: 'email',
      canReceivePromotional: false,
      schoolIds: [], // Will be updated
      userId: parentUserId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Check if ParentProfile already exists
    let existingParentProfile = await parentProfilesCollection.findOne({ userId: parentUserId });
    let parentProfileId;
    
    if (existingParentProfile) {
      console.log('✅ ParentProfile already exists');
      parentProfileId = existingParentProfile._id;
    } else {
      const parentProfileResult = await parentProfilesCollection.insertOne(parentProfile);
      parentProfileId = parentProfileResult.insertedId;
      console.log('✅ Created ParentProfile:', parentProfileId);
    }
    
    // Create Student Users and Profiles
    console.log('\n📝 Creating Student Users and Profiles...');
    
    const students = [
      {
        firstName: 'Emma',
        lastName: 'Smith',
        studentId: 'ST1319',
        email: 'emma.smith@defaultschool.edu',
        gradeLevel: '10',
        section: 'A',
        dateOfBirth: new Date('2008-03-15')
      },
      {
        firstName: 'Liam',
        lastName: 'Smith',
        studentId: 'ST5186',
        email: 'liam.smith@defaultschool.edu',
        gradeLevel: '8',
        section: 'B',
        dateOfBirth: new Date('2010-07-22')
      }
    ];
    
    const createdStudentIds = [];
    
    for (const studentData of students) {
      // Create User for student
      const existingStudentUser = await usersCollection.findOne({ email: studentData.email });
      let studentUserId;
      
      if (existingStudentUser) {
        console.log(`✅ Student user ${studentData.firstName} already exists`);
        studentUserId = existingStudentUser._id;
      } else {
        const studentUser = {
          email: studentData.email,
          password: '$2b$10$defaulthashedpassword', // Default hashed password
          firstName: studentData.firstName,
          lastName: studentData.lastName,
          role: 'STUDENT',
          status: 'ACTIVE',
          isEmailVerified: false,
          schoolId: null,
          studentProfileId: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        const studentUserResult = await usersCollection.insertOne(studentUser);
        studentUserId = studentUserResult.insertedId;
        console.log(`✅ Created student user ${studentData.firstName}:`, studentUserId);
      }
      
      // Create StudentProfile
      const existingStudentProfile = await studentProfilesCollection.findOne({ userId: studentUserId });
      let studentProfileId;
      
      if (existingStudentProfile) {
        console.log(`✅ StudentProfile for ${studentData.firstName} already exists`);
        studentProfileId = existingStudentProfile._id;
      } else {
        const studentProfile = {
          firstName: studentData.firstName,
          lastName: studentData.lastName,
          middleName: '',
          studentId: studentData.studentId,
          dateOfBirth: studentData.dateOfBirth,
          gender: 'Not Specified',
          gradeLevel: studentData.gradeLevel,
          section: studentData.section,
          enrollmentDate: new Date('2023-08-15'),
          expectedGraduation: new Date('2026-06-15'),
          address: {
            street: '123 Main St',
            city: 'Springfield',
            state: 'IL',
            zipCode: '12345',
            country: 'USA'
          },
          phone: '555-0127',
          emergencyContacts: [{
            name: 'John Smith',
            relationship: 'Father',
            phone: '555-0123',
            isPrimary: true
          }],
          medicalInfo: {
            allergies: [],
            medications: [],
            conditions: []
          },
          academicInfo: {
            currentGPA: 3.8,
            credits: 0,
            honors: []
          },
          userId: studentUserId,
          schoolId: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        const studentProfileResult = await studentProfilesCollection.insertOne(studentProfile);
        studentProfileId = studentProfileResult.insertedId;
        console.log(`✅ Created StudentProfile for ${studentData.firstName}:`, studentProfileId);
        
        // Update user with studentProfileId
        await usersCollection.updateOne(
          { _id: studentUserId },
          { $set: { studentProfileId: studentProfileId } }
        );
      }
      
      createdStudentIds.push({
        studentId: studentProfileId,
        relationship: 'Parent',
        isPrimaryContact: true,
        hasPickupPermission: true
      });
    }
    
    // Update ParentProfile with children
    console.log('\n🔗 Linking children to parent...');
    await parentProfilesCollection.updateOne(
      { _id: parentProfileId },
      { $set: { children: createdStudentIds } }
    );
    
    // Update User with parentProfileId
    await usersCollection.updateOne(
      { _id: parentUserId },
      { $set: { parentProfileId: parentProfileId } }
    );
    
    console.log('✅ Successfully set up unified auth parent-child relationships');
    
    // Verify the setup
    console.log('\n🔍 Verifying setup...');
    const updatedParentProfile = await parentProfilesCollection.findOne({ userId: parentUserId });
    console.log('Parent children count:', updatedParentProfile?.children?.length || 0);
    
    const studentProfiles = await studentProfilesCollection.find({ 
      _id: { $in: createdStudentIds.map(c => c.studentId) }
    }).toArray();
    
    console.log('Created student profiles:');
    studentProfiles.forEach((profile: any) => {
      console.log(`   - ${profile.firstName} ${profile.lastName} (${profile.studentId})`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('🔌 MongoDB connection closed');
  }
}

setupUnifiedAuthParentChild();
