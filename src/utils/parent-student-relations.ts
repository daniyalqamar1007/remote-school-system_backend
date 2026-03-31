/**
 * Utility functions for maintaining parent-student relationships
 * 
 * This ensures bidirectional consistency between:
 * - Student's parentIds[] array
 * - Parent's children[] array
 * - ParentProfile's children[] array (if using profiles)
 */

import { Model, Types } from 'mongoose';
import { User, UserDocument, UserRole } from '../auth/schemas/user.schema';
import { ParentProfile, ParentProfileDocument } from '../auth/schemas/parent-profile.schema';
import { StudentProfile, StudentProfileDocument } from '../auth/schemas/student-profile.schema';

/**
 * Link a student to a parent (bidirectional)
 * Updates both User model and ParentProfile if it exists
 */
export async function linkStudentToParent(
  studentUserId: string | Types.ObjectId,
  parentUserId: string | Types.ObjectId,
  options: {
    userModel: Model<UserDocument>;
    parentProfileModel?: Model<ParentProfileDocument>;
    studentProfileModel?: Model<StudentProfileDocument>;
    relationship?: string;
    isPrimaryContact?: boolean;
    hasPickupPermission?: boolean;
    session?: any;
  }
): Promise<void> {
  const studentId = typeof studentUserId === 'string' ? new Types.ObjectId(studentUserId) : studentUserId;
  const parentId = typeof parentUserId === 'string' ? new Types.ObjectId(parentUserId) : parentUserId;

  // IMPORTANT: When using transactions, we must use session and NOT use .lean() 
  // because .lean() might not see uncommitted documents in the transaction
  // NOTE: School validation removed - we only need to check roles, not school assignment
  const studentQuery = options.userModel.findById(studentId).select('role');
  const parentQuery = options.userModel.findById(parentId).select('role');
  
  // Apply session if provided (for transaction support)
  if (options.session) {
    studentQuery.session(options.session);
    parentQuery.session(options.session);
  }
  
  // Don't use .lean() when in a transaction - it won't see uncommitted documents
  const student = await studentQuery.exec();
  const parent = await parentQuery.exec();

  if (!student || !parent) {
    console.error(`❌ Student or parent not found - Student ID: ${studentId}, Parent ID: ${parentId}`);
    console.error(`❌ Student found: ${!!student}, Parent found: ${!!parent}`);
    if (options.session) {
      console.error(`❌ Using transaction session - this might be why documents aren't visible`);
    }
    throw new Error('Student or parent not found');
  }

  // Check if student is actually a student and parent is actually a parent
  if (student.role !== 'STUDENT') {
    throw new Error('First user must be a student');
  }
  if (parent.role !== 'PARENT') {
    throw new Error('Second user must be a parent');
  }

  // NOTE: School validation removed - parents and students can be linked regardless of school assignment
  // School assignment is handled separately and doesn't need to match for parent-child relationships

  const updateOptions = options.session ? { session: options.session } : {};

  // 1. Add parent to student's parentIds array (User model)
  await options.userModel.findByIdAndUpdate(
    studentId,
    { $addToSet: { parentIds: parentId } },
    updateOptions
  );

  // 2. Add student to parent's children array (User model)
  // First, ensure the parent document exists and has a children array initialized
  // IMPORTANT: Use session if provided, and don't use .lean() in transactions
  const parentDocQuery = options.userModel.findById(parentId).select('children');
  if (options.session) {
    parentDocQuery.session(options.session);
  }
  const parentDoc = await parentDocQuery.exec();
  if (!parentDoc) {
    console.error(`❌ Parent document ${parentId} not found when trying to add child ${studentId}`);
    throw new Error(`Parent ${parentId} not found`);
  }

  // Check if children array exists, if not initialize it
  // Convert to plain object if needed for array operations
  const childrenArray = (parentDoc.children || []).map((id: any) => 
    id instanceof Types.ObjectId ? id : new Types.ObjectId(id.toString())
  );
  const studentIdStr = studentId.toString();
  const alreadyExists = childrenArray.some((childId: any) => childId.toString() === studentIdStr);

  if (!alreadyExists) {
    // Use $addToSet to add student to parent's children array
    // $addToSet will automatically create the array if it doesn't exist
    // NOTE: Cannot use $setOnInsert with $addToSet on same field - causes MongoDB conflict
    const updateResult = await options.userModel.findByIdAndUpdate(
      parentId,
      { 
        $addToSet: { children: studentId }
      },
      updateOptions
    );

    if (!updateResult) {
      throw new Error(`Failed to update parent ${parentId} - parent not found after verification`);
    }

    // Verify the update was successful (use session if provided, don't use lean in transaction)
    const parentAfterUpdateQuery = options.userModel.findById(parentId).select('children');
    if (options.session) {
      parentAfterUpdateQuery.session(options.session);
    }
    const parentAfterUpdate = await parentAfterUpdateQuery.exec();
    if (parentAfterUpdate) {
      const hasStudent = (parentAfterUpdate.children || []).some(
        (childId: any) => childId.toString() === studentIdStr
      );
      if (!hasStudent) {
        console.error(`❌ WARNING: Student ${studentId} was not added to parent ${parentId}'s children array. Attempting fallback...`);
        // Try direct update as fallback - use $push to add to array
        // First ensure array exists, then push
        const fallbackUpdate = await options.userModel.findByIdAndUpdate(
          parentId,
          { 
            $push: { children: studentId }
          },
          updateOptions
        );
        if (fallbackUpdate) {
          console.log(`✅ Fallback: Successfully pushed student ${studentId} to parent ${parentId}'s children array`);
          
          // Verify fallback worked (use session if provided, don't use lean in transaction)
          const parentAfterFallbackQuery = options.userModel.findById(parentId).select('children');
          if (options.session) {
            parentAfterFallbackQuery.session(options.session);
          }
          const parentAfterFallback = await parentAfterFallbackQuery.exec();
          if (parentAfterFallback) {
            const hasStudentAfterFallback = (parentAfterFallback.children || []).some(
              (childId: any) => childId.toString() === studentIdStr
            );
            if (hasStudentAfterFallback) {
              console.log(`✅ Fallback verification: Student ${studentId} is now in parent ${parentId}'s children array`);
            } else {
              console.error(`❌ CRITICAL: Fallback also failed - Student ${studentId} still not in parent ${parentId}'s children array`);
            }
          }
        } else {
          console.error(`❌ CRITICAL: Fallback update failed - parent ${parentId} not found`);
        }
      } else {
        console.log(`✅ Verified: Student ${studentId} is in parent ${parentId}'s children array`);
      }
    }
  } else {
    console.log(`ℹ️ Student ${studentId} already exists in parent ${parentId}'s children array`);
  }

  // 3. Update ParentProfile if it exists
  if (options.parentProfileModel) {
    const profileQuery = options.parentProfileModel.findOne({ userId: parentId });
    const parentProfile = options.session 
      ? await profileQuery.session(options.session).exec()
      : await profileQuery.exec();
    if (parentProfile) {
      const childExists = parentProfile.children.some(
        (child: any) => child.studentId?.toString() === studentId.toString()
      );

      if (!childExists) {
        await options.parentProfileModel.findByIdAndUpdate(
          parentProfile._id,
          {
            $push: {
              children: {
                studentId: studentId,
                relationship: options.relationship || 'Parent',
                isPrimaryContact: options.isPrimaryContact !== undefined ? options.isPrimaryContact : false,
                hasPickupPermission: options.hasPickupPermission !== undefined ? options.hasPickupPermission : false,
              }
            }
          },
          updateOptions
        );
      }
    }
  }

  // 4. Update StudentProfile if it exists
  if (options.studentProfileModel) {
    await options.studentProfileModel.findOneAndUpdate(
      { userId: studentId },
      { $addToSet: { parentIds: parentId } },
      updateOptions
    );
  }
}

/**
 * Unlink a student from a parent (bidirectional)
 */
export async function unlinkStudentFromParent(
  studentUserId: string | Types.ObjectId,
  parentUserId: string | Types.ObjectId,
  options: {
    userModel: Model<UserDocument>;
    parentProfileModel?: Model<ParentProfileDocument>;
    studentProfileModel?: Model<StudentProfileDocument>;
    session?: any;
  }
): Promise<void> {
  const studentId = typeof studentUserId === 'string' ? new Types.ObjectId(studentUserId) : studentUserId;
  const parentId = typeof parentUserId === 'string' ? new Types.ObjectId(parentUserId) : parentUserId;

  const updateOptions = options.session ? { session: options.session } : {};

  // 1. Remove parent from student's parentIds array (User model)
  await options.userModel.findByIdAndUpdate(
    studentId,
    { $pull: { parentIds: parentId } },
    updateOptions
  );

  // 2. Remove student from parent's children array (User model)
  await options.userModel.findByIdAndUpdate(
    parentId,
    { $pull: { children: studentId } },
    updateOptions
  );

  // 3. Update ParentProfile if it exists
  if (options.parentProfileModel) {
    const profileQuery = options.parentProfileModel.findOne({ userId: parentId });
    const parentProfile = options.session 
      ? await profileQuery.session(options.session).exec()
      : await profileQuery.exec();
    if (parentProfile) {
      await options.parentProfileModel.findByIdAndUpdate(
        parentProfile._id,
        { $pull: { children: { studentId: studentId } } },
        updateOptions
      );
    }
  }

  // 4. Update StudentProfile if it exists
  if (options.studentProfileModel) {
    await options.studentProfileModel.findOneAndUpdate(
      { userId: studentId },
      { $pull: { parentIds: parentId } },
      updateOptions
    );
  }
}

/**
 * Link multiple students to a parent
 */
export async function linkStudentsToParent(
  studentUserIds: (string | Types.ObjectId)[],
  parentUserId: string | Types.ObjectId,
  options: {
    userModel: Model<UserDocument>;
    parentProfileModel?: Model<ParentProfileDocument>;
    studentProfileModel?: Model<StudentProfileDocument>;
    relationships?: { studentId: string; relationship?: string; isPrimaryContact?: boolean; hasPickupPermission?: boolean }[];
    session?: any;
  }
): Promise<void> {
  const parentId = typeof parentUserId === 'string' ? new Types.ObjectId(parentUserId) : parentUserId;

  for (const studentUserId of studentUserIds) {
    const relationship = options.relationships?.find(r => r.studentId === studentUserId.toString());
    await linkStudentToParent(studentUserId, parentId, {
      ...options,
      relationship: relationship?.relationship,
      isPrimaryContact: relationship?.isPrimaryContact,
      hasPickupPermission: relationship?.hasPickupPermission,
    });
  }
}

/**
 * Link a student to multiple parents
 */
export async function linkStudentToParents(
  studentUserId: string | Types.ObjectId,
  parentUserIds: (string | Types.ObjectId)[],
  options: {
    userModel: Model<UserDocument>;
    parentProfileModel?: Model<ParentProfileDocument>;
    studentProfileModel?: Model<StudentProfileDocument>;
    session?: any;
  }
): Promise<void> {
  for (const parentUserId of parentUserIds) {
    await linkStudentToParent(studentUserId, parentUserId, options);
  }
}

/**
 * Verify and fix relationship consistency
 * Checks if bidirectional relationships are in sync
 */
export async function verifyRelationshipConsistency(
  studentUserId: string | Types.ObjectId,
  parentUserId: string | Types.ObjectId,
  options: {
    userModel: Model<UserDocument>;
    session?: any;
  }
): Promise<{ isConsistent: boolean; fixes: string[] }> {
  const studentId = typeof studentUserId === 'string' ? new Types.ObjectId(studentUserId) : studentUserId;
  const parentId = typeof parentUserId === 'string' ? new Types.ObjectId(parentUserId) : parentUserId;

  // IMPORTANT: When using transactions, don't use .lean() as it won't see uncommitted documents
  const studentQuery = options.userModel.findById(studentId);
  const parentQuery = options.userModel.findById(parentId);
  
  // Apply session if provided (for transaction support)
  if (options.session) {
    studentQuery.session(options.session);
    parentQuery.session(options.session);
  }
  
  const student = await studentQuery.exec();
  const parent = await parentQuery.exec();

  if (!student || !parent) {
    return { isConsistent: false, fixes: ['Student or parent not found'] };
  }

  const fixes: string[] = [];
  let isConsistent = true;

  // Check if parent is in student's parentIds
  const parentInStudent = (student.parentIds || []).some(
    (id: any) => id.toString() === parentId.toString()
  );

  // Check if student is in parent's children
  const studentInParent = (parent.children || []).some(
    (id: any) => id.toString() === studentId.toString()
  );

  if (parentInStudent && !studentInParent) {
    isConsistent = false;
    fixes.push('Parent missing student in children array');
  }

  if (studentInParent && !parentInStudent) {
    isConsistent = false;
    fixes.push('Student missing parent in parentIds array');
  }

  return { isConsistent, fixes };
}

