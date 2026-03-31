import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import * as mongoose from 'mongoose';

// Type for User document with methods
export type UserDocument = User & Document & {
  comparePassword(candidatePassword: string): Promise<boolean>;
  incLoginAttempts(): Promise<void>;
  resetLoginAttempts(): Promise<void>;
  isLocked: boolean;
};

export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  TEACHER = 'TEACHER',
  STUDENT = 'STUDENT',
  PARENT = 'PARENT',
  NURSE = 'NURSE',
  SECRETARY = 'SECRETARY',
  GUIDANCE_COUNSELOR = 'GUIDANCE_COUNSELOR',
  PHYSICAL_EDUCATION_TEACHER = 'PHYSICAL_EDUCATION_TEACHER',
  COACH = 'COACH',
  SPECIAL_EDUCATION_TEACHER = 'SPECIAL_EDUCATION_TEACHER',
  INTERVENTIONIST = 'INTERVENTIONIST',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
}

@Schema({ timestamps: true })
export class User {
  // Add _id for TypeScript typing convenience (managed by Mongoose)
  _id: mongoose.Schema.Types.ObjectId;
  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ required: true })
  password: string; // Will be hashed

  @Prop({ trim: true })
  firstName: string;

  @Prop({ trim: true })
  lastName: string;

  @Prop({ required: true, enum: UserRole, default: UserRole.STUDENT })
  role: UserRole;

  @Prop({ type: [String], enum: UserRole, default: [] })
  additionalRoles: UserRole[];

  @Prop({ enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Prop()
  phone: string;

  // Additional profile fields for different roles
  @Prop()
  address: string;

  @Prop()
  dateOfBirth: Date;

  @Prop()
  gender: string;

  // Teacher-specific fields
  @Prop()
  qualifications: string;

  @Prop()
  experienceYears: string;

  @Prop()
  department: string;

  @Prop()
  specialization: string;

  @Prop()
  subject: string;

  // Nurse-specific fields
  @Prop()
  speciality: string;

  @Prop()
  licenseNumber: string;

  // Student-specific fields
  @Prop()
  studentId: string;

  @Prop()
  gradeLevel: string;

  @Prop()
  section: string;

  @Prop()
  admissionDate: Date;

  @Prop()
  class: string;

  @Prop()
  dob: Date;

  @Prop()
  enrollDate: Date;

  @Prop()
  expectedGraduation: string; // store as year string, e.g., "2035"

  @Prop()
  guardianName: string;

  @Prop()
  guardianPhone: string;

  @Prop()
  guardianEmail: string;

  @Prop()
  guardianRelationship: string;

  @Prop()
  bloodGroup: string;

  @Prop({ type: [String], default: [] })
  medicalConditions: string[];

  @Prop({ type: [String], default: [] })
  allergies: string[];

  @Prop()
  previousSchool: string;

  @Prop()
  previousGrade: string;

  @Prop()
  transportMode: string;

  @Prop()
  busRoute: string;

  @Prop()
  religion: string;

  // Student activities/clubs and flags
  @Prop({ type: [String], default: [] })
  clubs?: string[];

  @Prop({ default: false })
  iipFlag?: boolean;

  @Prop({ default: false })
  honorRolls?: boolean;

  @Prop({ default: false })
  athletics?: boolean;

  @Prop([{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }])
  parentIds: mongoose.Schema.Types.ObjectId[];

  @Prop([{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }])
  children: mongoose.Schema.Types.ObjectId[];

  // Parent-specific fields
  @Prop()
  occupation: string;

  @Prop({ 
    type: {
      firstName: { type: String },
      lastName: { type: String },
      phone: { type: String },
      relationship: { type: String },
    }
  })
  emergencyContact: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    relationship?: string;
  };

  // Common profile fields
  @Prop()
  profilePicture: string;

  // Documents
  @Prop({ type: [String], default: [] })
  transcripts?: string[]; // AWS URLs

  @Prop()
  nationality: string;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop()
  lastLogin: Date;

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop()
  lockoutUntil: Date;

  // School reference - null only for SUPER_ADMIN
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'School' })
  schoolId: mongoose.Schema.Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  lastSeen: Date;

  // Profile references - only one should be populated based on role
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'StudentProfile' })
  studentProfileId?: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'TeacherProfile' })
  teacherProfileId?: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'ParentProfile' })
  parentProfileId?: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'AdminProfile' })
  adminProfileId?: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'NurseProfile' })
  nurseProfileId?: mongoose.Schema.Types.ObjectId;

  // JWT refresh tokens
  @Prop({ type: [String], default: [] })
  refreshTokens: string[];

  // Security fields
  @Prop()
  passwordResetToken: string;

  @Prop()
  passwordResetExpires: Date;

  @Prop()
  emailVerificationToken: string;

  @Prop()
  emailVerificationExpires: Date;

  // Password management fields
  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop()
  passwordLastChanged: Date;

  @Prop()
  passwordExpiry: Date;

  @Prop({ default: false })
  accountLocked: boolean;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  mfaEnabled: boolean;

  @Prop()
  mfaSecret: string;

  @Prop()
  mfaTempCode: string;

  @Prop()
  mfaTempCodeExpiry: Date;

  @Prop({ type: [String], default: [] })
  previousPasswords: string[]; // Store hashes of previous passwords for reuse prevention

  // Audit fields
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  createdBy: mongoose.Schema.Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'User' })
  updatedBy: mongoose.Schema.Types.ObjectId;

  // Custom roles for role-based access control
  @Prop({ type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }], default: [] })
  customRoles?: mongoose.Schema.Types.ObjectId[];
}

export const UserSchema = SchemaFactory.createForClass(User);

// Indexes for performance (email is indexed but NOT unique to allow duplicates)
UserSchema.index({ email: 1 });
UserSchema.index({ schoolId: 1, role: 1 });
UserSchema.index({ status: 1 });

// User methods
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  const bcrypt = require('bcryptjs');
  return bcrypt.compare(candidatePassword, this.password);
};

// Virtual for account lockout
UserSchema.virtual('isLocked').get(function() {
  return !!(this.lockoutUntil && this.lockoutUntil.getTime() > Date.now());
});

// Pre-save middleware for password hashing
UserSchema.pre('save', async function(next) {
  const bcrypt = require('bcryptjs');
  
  // Only hash password if it's been modified
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const hashedPassword = await bcrypt.hash(this.password, 12);
    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  const bcrypt = require('bcryptjs');
  return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.incLoginAttempts = function() {
  const LOCK_TIME = 2 * 60 * 60 * 1000;
  const MAX_LOGIN_ATTEMPTS = 5;
  const current = (this as any).failedLoginAttempts ?? 0;
  const nextAttempts = current + 1;
  const isLocked = (this as any).lockoutUntil && new Date((this as any).lockoutUntil).getTime() > Date.now();

  if ((this as any).lockoutUntil && new Date((this as any).lockoutUntil).getTime() < Date.now()) {
    return this.updateOne({
      $unset: { lockoutUntil: 1 },
      $set: { failedLoginAttempts: 1 }
    });
  }

  const updates: any = { $inc: { failedLoginAttempts: 1 } };
  if (nextAttempts >= MAX_LOGIN_ATTEMPTS && !isLocked) {
    updates.$set = { ...(updates.$set || {}), lockoutUntil: new Date(Date.now() + LOCK_TIME) };
  }
  return this.updateOne(updates);
};

// Instance method to reset login attempts
UserSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { failedLoginAttempts: 1, lockoutUntil: 1 }
  });
};
