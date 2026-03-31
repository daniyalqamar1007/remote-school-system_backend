import { MongoClient, ObjectId } from "mongodb";
import * as bcrypt from "bcrypt";

// Load URI and seed password from environment
const uri = process.env.MONGO_URI || "mongodb+srv://daniyalqamar1007:9myDVVPAajTYvJi3@srscluster.hiluyui.mongodb.net/srs";
const seedPassword = process.env.SEED_PASSWORD || "123";
const client = new MongoClient(uri);

async function createSuperAdmin() {
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas");

    const db = client.db();
    const usersCollection = db.collection("users");

    // Check if Super Admin already exists
    const existingSuperAdmin = await usersCollection.findOne({ 
      email: "superadmin@srs.com" 
    });

    if (existingSuperAdmin) {
      console.log("Super Admin already exists!");
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(seedPassword, 12);

    // Create Super Admin user
    const superAdmin = {
      firstName: "Super",
      lastName: "Administrator",
      email: "superadmin@srs.com",
      password: hashedPassword,
      role: "SuperAdmin",
      customRoles: [],
      schoolId: null, // Super admin is not tied to a specific school
      phone: "+1-800-SUPERADMIN",
      isActive: true,
      isEmailVerified: true,
      profilePhoto: "N/A",
      lastLogin: null,
      passwordChangedAt: new Date(),
      mustChangePassword: false,
      mfaSettings: {
        isEnabled: false,
        method: null,
        secret: null,
        backupCodes: []
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireNumbers: true,
        requireSpecialChars: true,
        expirationDays: 90
      },
      loginHistory: [],
      failedLoginAttempts: 0,
      accountLockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await usersCollection.insertOne(superAdmin);
    console.log(`✅ Super Admin created successfully with ID: ${result.insertedId}`);

    // Create default permissions
    const permissionsCollection = db.collection("permissions");
    
    const defaultPermissions = [
      // User Management
      { name: "create_users", resource: "users", action: "create", description: "Create new user accounts", isActive: true },
      { name: "read_users", resource: "users", action: "read", description: "View user accounts", isActive: true },
      { name: "update_users", resource: "users", action: "update", description: "Update user accounts", isActive: true },
      { name: "delete_users", resource: "users", action: "delete", description: "Delete user accounts", isActive: true },
      
      // School Management
      { name: "create_schools", resource: "schools", action: "create", description: "Create new schools", isActive: true },
      { name: "read_schools", resource: "schools", action: "read", description: "View schools", isActive: true },
      { name: "update_schools", resource: "schools", action: "update", description: "Update school information", isActive: true },
      { name: "delete_schools", resource: "schools", action: "delete", description: "Delete schools", isActive: true },
      
      // Student Management
      { name: "create_students", resource: "students", action: "create", description: "Create student records", isActive: true },
      { name: "read_students", resource: "students", action: "read", description: "View student records", isActive: true },
      { name: "update_students", resource: "students", action: "update", description: "Update student records", isActive: true },
      { name: "delete_students", resource: "students", action: "delete", description: "Delete student records", isActive: true },
      
      // Grades & Attendance
      { name: "read_grades", resource: "grades", action: "read", description: "View student grades", isActive: true },
      { name: "update_grades", resource: "grades", action: "update", description: "Update student grades", isActive: true },
      { name: "read_attendance", resource: "attendance", action: "read", description: "View attendance records", isActive: true },
      { name: "update_attendance", resource: "attendance", action: "update", description: "Update attendance", isActive: true },
      
      // Role Management
      { name: "create_roles", resource: "roles", action: "create", description: "Create custom roles", isActive: true },
      { name: "read_roles", resource: "roles", action: "read", description: "View roles", isActive: true },
      { name: "update_roles", resource: "roles", action: "update", description: "Update roles", isActive: true },
      { name: "delete_roles", resource: "roles", action: "delete", description: "Delete roles", isActive: true },
      
      // System Administration
      { name: "system_admin", resource: "system", action: "admin", description: "Full system administration access", isActive: true },
      { name: "view_analytics", resource: "analytics", action: "read", description: "View system analytics", isActive: true },
      { name: "export_data", resource: "data", action: "export", description: "Export system data", isActive: true },
    ];

    // Insert permissions and get their IDs
    const permissionResults = await permissionsCollection.insertMany(defaultPermissions);
    const permissionIds = Object.values(permissionResults.insertedIds);
    
    console.log(`✅ Created ${permissionIds.length} default permissions`);

    // Create Super Admin role with all permissions
    const rolesCollection = db.collection("roles");
    const superAdminRole = {
      name: "SuperAdmin",
      description: "Full system administrator with all permissions",
      permissions: permissionIds,
      isActive: true,
      isSystemRole: true,
      schoolId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const roleResult = await rolesCollection.insertOne(superAdminRole);
    console.log(`✅ Super Admin role created with ID: ${roleResult.insertedId}`);

    // Create a sample school for testing
    const schoolsCollection = db.collection("schools");
    const sampleSchool = {
      name: "Demo High School",
      address: "123 Education Street, Demo City, DC 12345",
      schoolCode: "DHS001",
      phone: "+1-555-DEMO-SCH",
      email: "admin@demohigh.edu",
      adminIds: [],
      isActive: true,
      logo: "N/A",
      district: "Demo District",
      country: "United States",
      settings: {
        timezone: "America/New_York",
        academicYear: "2024-2025",
        gradingSystem: "Letter Grade",
        language: "English"
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const schoolResult = await schoolsCollection.insertOne(sampleSchool);
    console.log(`✅ Sample school created with ID: ${schoolResult.insertedId}`);

    console.log("\n🎉 Super Admin setup completed successfully!");
    console.log("\n📧 Login credentials:");
    console.log("Email: superadmin@srs.com");
    console.log(`Password: ${seedPassword}`);
    console.log("Role: SuperAdmin");
    console.log("\n🌐 Access the Super Admin dashboard at: http://localhost:3000");
    console.log("1. Go to the login page");
    console.log("2. Select 'Super Admin' role");
    console.log("3. Use the credentials above");

  } catch (error) {
    console.error("Error creating Super Admin:", error);
  } finally {
    await client.close();
  }
}

// Execute the function
createSuperAdmin().catch(console.error);
