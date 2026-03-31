import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../auth/schemas/user.schema';
import { Student, StudentSchema } from '../student/schema/student.schema';
import { Teacher, TeacherSchema } from '../teacher/schema/schema.teacher';
import { Nurse, NurseSchema } from '../nurse/schema/nurse.schema';
import { Parent, ParentSchema } from '../parent/schema/parent.schema';
import { Course, CourseSchema } from '../course/schema/course.schema';
import { School, SchoolSchema } from '../auth/schemas/school.schema';
import { Activity, ActivitySchema } from '../activity/schema/schema.activity';
import { ParentProfile, ParentProfileSchema } from '../auth/schemas/parent-profile.schema';
import { TeacherProfile, TeacherProfileSchema } from '../auth/schemas/teacher-profile.schema';
import { CourseAssignment, CourseAssignmentSchema } from '../course/schema/course-assignment.schema';
import { Department, DepartmentSchema } from '../auth/schemas/department.schema';
import { Schedule, ScheduleSchema } from '../schedule/schema/schedule.schema';
import { DisciplinaryAction, DisciplinaryActionSchema } from '../behavior/schema/disciplinary-action.schema';
import { Club, ClubSchema } from '../club/schema/club.schema';
import { ClubMembership, ClubMembershipSchema } from '../club/schema/club-membership.schema';
import { SportsProgram, SportsProgramSchema } from '../sports/schema/sports-program.schema';
import { StudentSports, StudentSportsSchema } from '../sports/schema/student-sports.schema';
import { ClubModule } from '../club/club.module';
import { SportsModule } from '../sports/sports.module';
import { TeacherModule } from '../teacher/teacher.module';
import { LessonPlanModule } from '../lesson-plan/lesson-plan.module';
import { HonorRollModule } from '../honor-roll/honor-roll.module';
import { ActivityModule } from '../activity/activity.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AwsModule } from '../aws/aws.module';
import { EmailModule } from '../email/email.module';
import { AcademicTerm, AcademicTermSchema } from '../super-admin/schemas/academic-term.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Teacher.name, schema: TeacherSchema },
      { name: Nurse.name, schema: NurseSchema },
      { name: Parent.name, schema: ParentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: School.name, schema: SchoolSchema },
      { name: Activity.name, schema: ActivitySchema },
      { name: ParentProfile.name, schema: ParentProfileSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
      { name: CourseAssignment.name, schema: CourseAssignmentSchema },
      { name: DisciplinaryAction.name, schema: DisciplinaryActionSchema },
      { name: Club.name, schema: ClubSchema },
      { name: ClubMembership.name, schema: ClubMembershipSchema },
      { name: SportsProgram.name, schema: SportsProgramSchema },
      { name: StudentSports.name, schema: StudentSportsSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: Schedule.name, schema: ScheduleSchema },
      { name: AcademicTerm.name, schema: AcademicTermSchema },
    ]),
    ClubModule,
    SportsModule,
    TeacherModule,
    LessonPlanModule,
    HonorRollModule,
    ActivityModule,
    AttendanceModule,
    AwsModule,
    EmailModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
