import { Injectable } from '@nestjs/common';
import { TeacherService } from 'src/teacher/teacher.service';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '../auth/schemas/user.schema';
import { StudentService } from 'src/student/student.service';
import { ParentService } from 'src/parent/parent.service';
import { NurseService } from 'src/nurse/nurse.service';
import { SuperAdminService } from 'src/super-admin/super-admin.service';
import { SecretaryService } from 'src/secretary/secretary.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(
    private readonly teacherService: TeacherService,
    private readonly studentService: StudentService,
    private readonly parentService: ParentService,
    private readonly nurseService: NurseService,
    private readonly superAdminService: SuperAdminService,
    private readonly secretaryService: SecretaryService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string, type: string) {
    console.log('type', type);
    if (type === UserRole.TEACHER) {
      return this.teacherService.validateTeacher({ email, password });
    }
    if (type === UserRole.STUDENT) {
      return this.studentService.validateStudent({ email, password });
    }
    if (type === UserRole.PARENT) {
      return this.parentService.validateParent({ email, password });
    }
    if (type === UserRole.NURSE) {
      return this.nurseService.validateNurse({ email, password });
    }
    if (type === UserRole.SUPER_ADMIN) {
      return this.validateSuperAdmin(email, password);
    }
    if (type === UserRole.SECRETARY) {
      return this.secretaryService.validateSecretary({ email, password });
    }
  }

  async validateSuperAdmin(email: string, password: string) {
    try {
      // Get all users with SuperAdmin role
      const result = await this.superAdminService.getAllUsers(1, 10, email, 'SuperAdmin');
      const superAdminUser = result.users.find(user => user.email === email);
      
      if (!superAdminUser) {
        return null;
      }

      // Get the full user with password for comparison
      const fullUser = await this.superAdminService.getUserById(superAdminUser._id);
      
      // For validation, we need to get the user with password from the database directly
      // Since the service doesn't return password, we'll create a helper method
      const userWithPassword = await this.superAdminService.getUserWithPassword(email);
      
      if (!userWithPassword) {
        return null;
      }

      const isPasswordValid = await bcrypt.compare(password, userWithPassword.password);
      
      if (isPasswordValid) {
        // Update last login
        await this.superAdminService.updateUser(userWithPassword._id, {
          // We can add lastLogin update here if needed
        });
        
        // Return user without password
        const { password: _, ...userWithoutPassword } = userWithPassword;
        return userWithoutPassword;
      }
      
      return null;
    } catch (error) {
      console.error('SuperAdmin validation error:', error);
      return null;
    }
  }

  generateJwt(user: any, role?: string) {
    const payload: any = { sub: user._id, email: user.email };
    if (role) payload.role = role;
    return this.jwtService.sign(payload);
  }
}