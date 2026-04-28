import { MongoClient, ObjectId } from 'mongodb';
import * as bcrypt from 'bcrypt';

async function seedComprehensiveParentStudentData() {
  const uri =
    process.env.MONGO_URI ||
    process.env.MONGODB_CONNECTION_URL ||
    'mongodb://localhost:27017/srs';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("🔗 Connected to MongoDB");

    const database = client.db('srs');
    const studentsCollection = database.collection('students');
    const parentsCollection = database.collection('parents');
    const attendanceCollection = database.collection('attendances');
    const gradesCollection = database.collection('grades');
    const coursesCollection = database.collection('courses');
    const teachersCollection = database.collection('teachers');
    const departmentsCollection = database.collection('departments');
    const schoolsCollection = database.collection('schools');

    // Hash a default password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash('123', salt);

    // Find a parent user to link students to (you can modify this email)
    const parentEmail = 'parent@defaultschool.edu'; // Change this to your actual parent email
    let parent = await parentsCollection.findOne({ email: parentEmail });

    if (!parent) {
      console.log(`📝 Creating parent with email: ${parentEmail}`);
      const newParent = {
        firstName: 'John',
        lastName: 'Smith',
        email: parentEmail,
        password: hashedPassword,
        phone: '555-123-4567',
        address: '123 Family Street, Parent City, PC 12345',
        children: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const parentResult = await parentsCollection.insertOne(newParent);
      parent = { ...newParent, _id: parentResult.insertedId };
      console.log(`✅ Created parent:`, parent._id);
    } else {
      console.log(`👨‍👩‍👧‍👦 Found existing parent:`, parent._id);
    }

    // Create school first
    let school = await schoolsCollection.findOne({ name: 'Default School' });
    if (!school) {
      const schoolResult = await schoolsCollection.insertOne({
        name: 'Default School',
        address: '123 School Street, Education City, EC 12345',
        phone: '555-SCHOOL',
        email: 'admin@defaultschool.edu',
        website: 'www.defaultschool.edu',
        principal: 'Dr. Jane Smith',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      school = { name: 'Default School', _id: schoolResult.insertedId };
      console.log(`🏫 Created school:`, school._id);
    } else {
      console.log(`🏫 Found existing school:`, school._id);
    }

    // Create departments first
    const departmentData = [
      { departmentName: 'Mathematics', code: 'MATH', description: 'Mathematics Department' },
      { departmentName: 'English', code: 'ENG', description: 'English Department' },
      { departmentName: 'Science', code: 'SCI', description: 'Science Department' },
      { departmentName: 'Social Studies', code: 'HIST', description: 'Social Studies Department' }
    ];

    const departmentIds = [];
    for (const dept of departmentData) {
      let existingDept = await departmentsCollection.findOne({ 
        $or: [
          { code: dept.code },
          { departmentName: dept.departmentName }
        ]
      });
      if (!existingDept) {
        const deptResult = await departmentsCollection.insertOne({
          ...dept,
          schoolId: school._id,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        departmentIds.push(deptResult.insertedId);
        console.log(`🏢 Created department: ${dept.departmentName}`);
      } else {
        departmentIds.push(existingDept._id);
        console.log(`🏢 Found existing department: ${dept.departmentName}`);
      }
    }

    // Create or find courses
    const courseData = [
      { courseCode: 'MATH101', courseName: 'Mathematics Grade 9', departmentIndex: 0, class: '9', section: 'A' },
      { courseCode: 'ENG101', courseName: 'English Literature Grade 9', departmentIndex: 1, class: '9', section: 'A' },
      { courseCode: 'SCI101', courseName: 'General Science Grade 9', departmentIndex: 2, class: '9', section: 'A' },
      { courseCode: 'HIST101', courseName: 'World History Grade 9', departmentIndex: 3, class: '9', section: 'A' },
      { courseCode: 'MATH201', courseName: 'Advanced Mathematics Grade 11', departmentIndex: 0, class: '11', section: 'B' },
      { courseCode: 'ENG201', courseName: 'Advanced English Grade 11', departmentIndex: 1, class: '11', section: 'B' },
      { courseCode: 'PHYS201', courseName: 'Physics Grade 11', departmentIndex: 2, class: '11', section: 'B' },
      { courseCode: 'CHEM201', courseName: 'Chemistry Grade 11', departmentIndex: 2, class: '11', section: 'B' }
    ];

    const courseIds = [];
    for (const course of courseData) {
      let existingCourse = await coursesCollection.findOne({ courseCode: course.courseCode });
      if (!existingCourse) {
        const courseResult = await coursesCollection.insertOne({
          courseCode: course.courseCode,
          courseName: course.courseName,
          description: `${course.courseName} for Grade ${course.class}-${course.section}`,
          departmentId: departmentIds[course.departmentIndex],
          courseCredit: 3,
          active: true,
          assigned: false,
          special: false,
          duration: 'Semester',
          Prerequisites: '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        courseIds.push(courseResult.insertedId);
        console.log(`📚 Created course: ${course.courseName}`);
      } else {
        courseIds.push(existingCourse._id);
        console.log(`📖 Found existing course: ${course.courseName}`);
      }
    }

    // Create or find teachers
    const teacherData = [
      { firstName: 'Sarah', lastName: 'Johnson', email: 'sarah.johnson@defaultschool.edu', subject: 'Mathematics', departmentIndex: 0 },
      { firstName: 'Michael', lastName: 'Brown', email: 'michael.brown@defaultschool.edu', subject: 'English', departmentIndex: 1 },
      { firstName: 'Dr. Emily', lastName: 'Davis', email: 'emily.davis@defaultschool.edu', subject: 'Science', departmentIndex: 2 },
      { firstName: 'Robert', lastName: 'Wilson', email: 'robert.wilson@defaultschool.edu', subject: 'History', departmentIndex: 3 }
    ];

    const teacherIds = [];
    for (const teacher of teacherData) {
      let existingTeacher = await teachersCollection.findOne({ email: teacher.email });
      if (!existingTeacher) {
        const teacherResult = await teachersCollection.insertOne({
          firstName: teacher.firstName,
          lastName: teacher.lastName,
          email: teacher.email,
          password: hashedPassword,
          phone: '555-' + Math.floor(Math.random() * 9000000 + 1000000),
          address: '456 Teacher Lane, Education City, EC 67890',
          department: teacher.subject,
          departmentId: departmentIds[teacher.departmentIndex],
          qualification: 'Masters in ' + teacher.subject,
          experience: Math.floor(Math.random() * 15 + 5), // 5-20 years
          joiningDate: '2020-09-01',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        teacherIds.push(teacherResult.insertedId);
        console.log(`👨‍🏫 Created teacher: ${teacher.firstName} ${teacher.lastName}`);
      } else {
        teacherIds.push(existingTeacher._id);
        console.log(`👩‍🏫 Found existing teacher: ${teacher.firstName} ${teacher.lastName}`);
      }
    }

    // Create comprehensive student data
    const studentsData = [
      {
        studentId: 'ST' + Math.floor(Math.random() * 9000 + 1000),
        firstName: 'Emma',
        lastName: 'Smith',
        class: '9',
        section: 'A',
        gender: 'Female',
        dob: '2009-05-15',
        email: `emma.smith.${Date.now()}@student.example.com`,
        phone: '555-111-1111',
        address: '123 Family Street, Parent City, PC 12345',
        emergencyContact: '555-999-9999',
        enrollDate: '2022-09-01',
        expectedGraduation: '2026-06-15',
        password: hashedPassword,
        parents: [parent._id],
        profilePhoto: 'https://i.pravatar.cc/150?u=emma',
        transcripts: [],
        iipFlag: false,
        honorRolls: true,
        athletics: true,
        clubs: 'Drama Club, Science Club',
        reportCards: [],
        lunch: 'Regular',
        nationality: 'American'
      },
      {
        studentId: 'ST' + Math.floor(Math.random() * 9000 + 1000),
        firstName: 'Liam',
        lastName: 'Smith',
        class: '11',
        section: 'B',
        gender: 'Male',
        dob: '2007-03-22',
        email: `liam.smith.${Date.now()}@student.example.com`,
        phone: '555-222-2222',
        address: '123 Family Street, Parent City, PC 12345',
        emergencyContact: '555-999-9999',
        enrollDate: '2020-09-01',
        expectedGraduation: '2024-06-15',
        password: hashedPassword,
        parents: [parent._id],
        profilePhoto: 'https://i.pravatar.cc/150?u=liam',
        transcripts: [],
        iipFlag: false,
        honorRolls: false,
        athletics: false,
        clubs: 'Robotics Club, Chess Club',
        reportCards: [],
        lunch: 'Vegetarian',
        nationality: 'American'
      }
    ];

    const createdStudents = [];
    
    // Insert students
    for (const studentData of studentsData) {
      // Check if student with similar name already exists for this parent
      const existingStudent = await studentsCollection.findOne({ 
        firstName: studentData.firstName, 
        lastName: studentData.lastName,
        parents: parent._id 
      });
      
      if (!existingStudent) {
        const studentResult = await studentsCollection.insertOne({
          ...studentData,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        createdStudents.push({ ...studentData, _id: studentResult.insertedId });
        console.log(`👨‍🎓 Created student: ${studentData.firstName} ${studentData.lastName} (ID: ${studentData.studentId})`);
      } else {
        createdStudents.push(existingStudent);
        console.log(`👩‍🎓 Found existing student: ${studentData.firstName} ${studentData.lastName}`);
      }
    }

    // Update parent with children
    const studentIds = createdStudents.map(s => s._id);
    await parentsCollection.updateOne(
      { _id: parent._id },
      { $set: { children: studentIds } }
    );
    console.log(`👨‍👩‍👧‍👦 Linked ${studentIds.length} students to parent`);

    // Create realistic attendance data (last 30 days)
    const attendanceData = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      // Skip weekends
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      for (const student of createdStudents) {
        for (let courseIndex = 0; courseIndex < 4; courseIndex++) {
          const courseId = courseIds[student.class === '9' ? courseIndex : courseIndex + 4];
          const teacherId = teacherIds[courseIndex];
          
          const attendanceStatus = Math.random() > 0.1 ? 'Present' : (Math.random() > 0.5 ? 'Late' : 'Absent');
          
          const attendanceRecord = {
            teacherId: teacherId,
            courseId: courseId,
            date: dateString,
            class: student.class,
            section: student.section,
            students: [{
              _id: student._id,
              studentId: student.studentId,
              studentName: `${student.firstName} ${student.lastName}`,
              attendance: attendanceStatus,
              checkInTime: attendanceStatus === 'Present' ? '08:00' : (attendanceStatus === 'Late' ? '08:15' : null),
              checkOutTime: attendanceStatus !== 'Absent' ? '15:30' : null,
              note: attendanceStatus === 'Absent' ? 'Family emergency' : '',
              reason: attendanceStatus === 'Late' ? 'Traffic' : ''
            }],
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          attendanceData.push(attendanceRecord);
        }
      }
    }

    // Insert attendance data in batches
    if (attendanceData.length > 0) {
      await attendanceCollection.insertMany(attendanceData);
      console.log(`📅 Created ${attendanceData.length} attendance records`);
    }

    // Create realistic grade data
    const gradeData = [];
    const terms = ['Fall', 'Spring'];
    
    for (const student of createdStudents) {
      for (const term of terms) {
        for (let courseIndex = 0; courseIndex < 4; courseIndex++) {
          const courseId = courseIds[student.class === '9' ? courseIndex : courseIndex + 4];
          const teacherId = teacherIds[courseIndex];
          
          // Generate realistic grades
          const quizScore = Math.floor(Math.random() * 30 + 70); // 70-100
          const midTermScore = Math.floor(Math.random() * 30 + 70);
          const projectScore = Math.floor(Math.random() * 30 + 70);
          const finalTermScore = Math.floor(Math.random() * 30 + 70);
          
          // Calculate weighted overall score
          const overall = Math.round(
            (quizScore * 0.2) + 
            (midTermScore * 0.3) + 
            (projectScore * 0.2) + 
            (finalTermScore * 0.3)
          );
          
          const gradeRecord = {
            teacherId: teacherId,
            courseId: courseId,
            studentId: student._id,
            class: student.class,
            section: student.section,
            term: term,
            quiz: { score: quizScore, weightage: 20 },
            midTerm: { score: midTermScore, weightage: 30 },
            project: { score: projectScore, weightage: 20 },
            finalTerm: { score: finalTermScore, weightage: 30 },
            overAll: overall,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          gradeData.push(gradeRecord);
        }
      }
    }

    // Insert grade data
    if (gradeData.length > 0) {
      await gradesCollection.insertMany(gradeData);
      console.log(`📊 Created ${gradeData.length} grade records`);
    }

    // Summary
    console.log('\n🎉 COMPREHENSIVE SEED COMPLETED!');
    console.log('=================================');
    console.log(`👨‍👩‍👧‍👦 Parent: ${parent.firstName} ${parent.lastName} (${parent.email})`);
    console.log(`🏫 School: Default School`);
    console.log(`🏢 Departments: ${departmentData.length}`);
    console.log(`👨‍🎓 Students Created: ${createdStudents.length}`);
    createdStudents.forEach(student => {
      console.log(`   - ${student.firstName} ${student.lastName} (${student.studentId}) - Grade ${student.class}${student.section}`);
    });
    console.log(`📚 Courses: ${courseData.length}`);
    console.log(`👨‍🏫 Teachers: ${teacherData.length}`);
    console.log(`📅 Attendance Records: ${attendanceData.length}`);
    console.log(`📊 Grade Records: ${gradeData.length}`);
    console.log('\n💡 Now your parent portal should show real data!');
    console.log(`🔑 Login with: ${parent.email} / password: 123`);

  } catch (error) {
    console.error('❌ Error seeding data:', error);
  } finally {
    await client.close();
    console.log("🔌 MongoDB connection closed");
  }
}

// Run the seed script
seedComprehensiveParentStudentData().catch(console.error);
