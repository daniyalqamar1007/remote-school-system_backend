export class CreateAcademicTermDto {
  name: string;
  startDate: Date;
  endDate: Date;
  type: string; // 'semester', 'quarter', 'trimester', 'term'
  academicYear: string; // e.g., '2024-2025'
  schoolId?: string; // 
    // - null/"global" = Global term (applies to all schools)
    // - Valid MongoDB ID = School-specific term
  isActive?: boolean;
}

export class UpdateAcademicTermDto {
  name?: string;
  startDate?: Date;
  endDate?: Date;
  type?: string;
  academicYear?: string;
  schoolId?: string;
  isActive?: boolean;
}