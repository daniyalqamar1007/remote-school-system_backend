import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation, ConversationDocument } from './schema/conversation.schema';
import { Message, MessageDocument } from './schema/message.schema';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { CourseAssignment, CourseAssignmentDocument } from '../course/schema/course-assignment.schema';
import { AwsService } from '../aws/aws.service';
import { UploadedFileType } from '../../utils/multer.config';

@Injectable()
export class CommunicationService {
  constructor(
    @InjectModel(Conversation.name) private conversationModel: Model<ConversationDocument>,
    @InjectModel(Message.name) private messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(CourseAssignment.name) private courseAssignmentModel: Model<CourseAssignmentDocument>,
    private awsService: AwsService,
  ) {}

  async getContacts(userId: string, schoolId: any, role: string): Promise<any[]> {
    const roleNorm = role && String(role).toUpperCase();
    console.log('getContacts called with:', { userId, schoolId, role: roleNorm });
    if (roleNorm === 'STUDENT') {
      const student = await this.userModel.findById(userId).select('class section gradeLevel schoolId').lean();
      if (!student) {
        return [];
      }

      let effectiveSchoolId = schoolId;
      if (!effectiveSchoolId && student.schoolId) {
        effectiveSchoolId = student.schoolId.toString();
      }
      if (!effectiveSchoolId) {
        console.log('Student missing schoolId, returning empty contacts');
        return [];
      }

      let gradeLevel: number | null = null;
      const classStr = String(student.class || student.gradeLevel || '');
      if (classStr.toLowerCase() === 'kindergarten' || classStr.toLowerCase() === 'k') {
        gradeLevel = 0;
      } else {
        const gradeMatch = classStr.match(/\d+/);
        if (gradeMatch) {
          gradeLevel = parseInt(gradeMatch[0]);
        }
      }

      const section = String(student.section || '').trim().toUpperCase();
      if (gradeLevel === null || !section) {
        console.log('Student missing class or section, returning empty contacts');
        return [];
      }

      const schoolIdObj = typeof effectiveSchoolId === 'string' ? new Types.ObjectId(effectiveSchoolId) : effectiveSchoolId;
      const matchingAssignments = await this.courseAssignmentModel.find({
        schoolId: schoolIdObj,
        'grades.level': gradeLevel,
        'grades.section': section
      }).populate('teacherId', 'firstName lastName email role').lean();

      const teacherMap = new Map();
      matchingAssignments.forEach((assignment: any) => {
        const teacher = assignment.teacherId;
        if (teacher && teacher._id) {
          teacherMap.set(teacher._id.toString(), {
            _id: teacher._id,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            email: teacher.email ?? '',
            role: teacher.role || 'TEACHER'
          });
        }
      });

      const teachers = Array.from(teacherMap.values());
      console.log('Student contacts (filtered by assigned courses):', { teachers: teachers.length, gradeLevel, section });
      return teachers;
    }
    
    if (roleNorm === 'TEACHER') {
      if (!schoolId) {
        console.log('Teacher contacts - missing schoolId');
        return [];
      }
      const schoolIdObj = typeof schoolId === 'string' ? new Types.ObjectId(schoolId) : new Types.ObjectId(schoolId.toString());
      const teacherAssignments = await this.courseAssignmentModel.find({
        teacherId: new Types.ObjectId(userId),
        schoolId: schoolIdObj
      }).select('grades').lean();

      const gradeSectionSet = new Set<string>();
      teacherAssignments.forEach((a: any) => {
        if (Array.isArray(a.grades)) {
          a.grades.forEach((g: { level: number; section: string }) => {
            const section = String(g.section || '').trim().toUpperCase();
            if (section) {
              gradeSectionSet.add(`${g.level}:${section}`);
            }
          });
        }
      });

      if (gradeSectionSet.size === 0) {
        console.log('Teacher contacts - No grade/sections assigned');
        return [];
      }

      const allStudents = await this.userModel.find({
        schoolId: schoolIdObj,
        role: 'STUDENT',
        isActive: true
      }).select('firstName lastName email role _id class section gradeLevel').lean();

      const studentIds: Types.ObjectId[] = [];
      for (const s of allStudents) {
        let level: number | null = null;
        const classStr = String(s.class || s.gradeLevel || '');
        if (classStr.toLowerCase() === 'kindergarten' || classStr.toLowerCase() === 'k') {
          level = 0;
        } else {
          const m = classStr.match(/\d+/);
          if (m) level = parseInt(m[0]);
        }
        const section = String(s.section || '').trim().toUpperCase();
        if (level !== null && section && gradeSectionSet.has(`${level}:${section}`)) {
          studentIds.push(s._id instanceof Types.ObjectId ? s._id : new Types.ObjectId(s._id.toString()));
        }
      }

      const uniqueStudentIds = Array.from(new Set(studentIds.map(id => id.toString()))).map(id => new Types.ObjectId(id));
      const uniqueIdStrs = new Set(uniqueStudentIds.map(id => id.toString()));
      const students = allStudents.filter((s: any) => s._id && uniqueIdStrs.has(s._id.toString()));

      const parents = uniqueStudentIds.length > 0
        ? await this.userModel.find({
            role: 'PARENT',
            isActive: true,
            children: { $in: uniqueStudentIds }
          }).select('firstName lastName email role _id').lean()
        : [];

      const uniqueParents = Array.from(new Map(parents.map((p: any) => [p._id.toString(), p])).values());

      const contactsWithRole = [
        ...students.map((contact: any) => ({
          ...contact,
          roleLabel: 'Student'
        })),
        ...uniqueParents.map((contact: any) => ({
          ...contact,
          roleLabel: 'Parent'
        }))
      ];

      console.log('Teacher contacts (assigned students and their parents only):', { students: students.length, parents: uniqueParents.length });
      return contactsWithRole;
    }
    
    if (roleNorm === 'PARENT') {
      console.log('Getting contacts for PARENT role, userId:', userId, 'schoolId:', schoolId);
      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        console.log('Parent user not found');
        return [];
      }

      const childrenIds = (user as any).children || [];
      if (childrenIds.length === 0) {
        console.log('Parent has no children linked');
        return [];
      }

      const childrenObjectIds = childrenIds.map((id: any) => {
        if (typeof id === 'string') {
          return new Types.ObjectId(id);
        }
        return id instanceof Types.ObjectId ? id : new Types.ObjectId(id.toString());
      });

      const children = await this.userModel.find({
        _id: { $in: childrenObjectIds },
        role: 'STUDENT',
        isActive: true
      }).select('schoolId').lean().exec();

      if (children.length === 0) {
        console.log('Parent children not found or not students');
        return [];
      }

      const schoolIds = new Set<string>();
      children.forEach((child: any) => {
        const sid = child.schoolId;
        if (sid) {
          const str = sid instanceof Types.ObjectId ? sid.toString() : String(sid);
          if (str && str !== 'null' && str !== 'undefined') schoolIds.add(str);
        }
      });

      if (schoolIds.size === 0) {
        console.log('Parent children have no schoolId');
        return [];
      }

      const schoolIdArray = Array.from(schoolIds).map(id => new Types.ObjectId(id));
      const teachers = await this.userModel.find({
        role: 'TEACHER',
        schoolId: { $in: schoolIdArray },
        isActive: true
      }).select('firstName lastName email role _id').lean().exec();

      const contacts = (teachers as any[]).map(t => ({
        _id: t._id,
        firstName: t.firstName,
        lastName: t.lastName,
        email: t.email ?? '',
        role: t.role || 'TEACHER'
      }));

      console.log('Parent contacts (all teachers from children schools):', contacts.length);
      return contacts;
    }
    
    console.log('No role matched, returning empty array');
    return [];
  }

  async getConversations(userId: string, schoolId: any): Promise<any[]> {
    // Get user to determine role
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      return [];
    }

    let schoolIds: string[] = [];
    
    // For parents, get conversations from all schools where their children are enrolled
    if (user.role === 'PARENT') {
      const childrenIds = user.children || [];
      if (childrenIds.length > 0) {
        const children = await this.userModel.find({
          _id: { $in: childrenIds },
          isActive: true
        }).select('schoolId').lean().exec();
        
        const uniqueSchoolIds = new Set<string>();
        children.forEach(child => {
          if (child.schoolId) {
            const schoolIdStr = child.schoolId.toString();
            if (schoolIdStr && schoolIdStr !== 'null' && schoolIdStr !== 'undefined') {
              uniqueSchoolIds.add(schoolIdStr);
            }
          }
        });
        schoolIds = Array.from(uniqueSchoolIds);
      }
    } else {
      // For other roles, use the provided schoolId
      const schoolIdStr = schoolId && schoolId.toString ? schoolId.toString() : schoolId;
      if (schoolIdStr) {
        schoolIds = [schoolIdStr];
      }
    }

    // Build query - if we have schoolIds, filter by them, otherwise get all conversations for the user
    const query: any = { participants: new Types.ObjectId(userId) };
    if (schoolIds.length > 0) {
      query.schoolId = { $in: schoolIds };
    }
    // If no schoolIds and not a parent, don't filter by schoolId (for backward compatibility)

    const convos = await this.conversationModel
      .find(query)
      .populate('participants', 'firstName lastName email role')
      .populate('lastMessageId')
      .sort({ lastMessageAt: -1 })
      .exec();
    return convos;
  }

  async getMessages(conversationId: string, userId: string, schoolId: any, page: number = 1, limit: number = 50): Promise<any[]> {
    const convo = await this.conversationModel.findById(conversationId);
    
    if (!convo) {
      throw new NotFoundException('Conversation not found');
    }

    // Check if user is a participant
    const participantIds = convo.participants.map(p => p.toString());
    const userIdStr = userId.toString();
    if (!participantIds.includes(userIdStr)) {
      throw new NotFoundException('Conversation not found');
    }

    // Get user to check role
    const user = await this.userModel.findById(userId).exec();
    
    // For parents, validate they can access this conversation through their children's schools
    if (user && user.role === 'PARENT') {
      const childrenIds = user.children || [];
      if (childrenIds.length > 0) {
        const children = await this.userModel.find({
          _id: { $in: childrenIds },
          isActive: true
        }).select('schoolId').lean().exec();
        
        const childrenSchoolIds = new Set<string>();
        children.forEach(child => {
          if (child.schoolId) {
            const schoolIdStr = child.schoolId.toString();
            if (schoolIdStr && schoolIdStr !== 'null' && schoolIdStr !== 'undefined') {
              childrenSchoolIds.add(schoolIdStr);
            }
          }
        });
        
        // Check if conversation's schoolId matches any of the children's schools
        const convoSchoolIdStr = convo.schoolId?.toString();
        if (convoSchoolIdStr && !childrenSchoolIds.has(convoSchoolIdStr)) {
          // Still allow if conversation has no schoolId (backward compatibility)
          if (convo.schoolId) {
            throw new NotFoundException('Conversation not found');
          }
        }
      }
    } else {
      // For non-parent users, validate schoolId match if provided
      const schoolIdStr = schoolId && schoolId.toString ? schoolId.toString() : schoolId;
      if (schoolIdStr && convo.schoolId && convo.schoolId.toString() !== schoolIdStr) {
        throw new NotFoundException('Conversation not found');
      }
    }
    
    const skip = (page - 1) * limit;
    const messages = await this.messageModel
      .find({ conversationId: new Types.ObjectId(conversationId) })
      .sort({ createdAt: 1 }) // Changed to ascending order (oldest first)
      .skip(skip)
      .limit(limit)
      .exec();

    // Generate signed URLs for file messages
    const messagesWithSignedUrls = await Promise.all(
      messages.map(async (msg) => {
        if (msg.type !== 'text' && msg.content) {
          try {
            const s3Key = this.awsService.extractS3Key(msg.content);
            const signedUrl = await this.awsService.generateDownloadSignedUrl(s3Key, 3600); // 1 hour expiry
            return {
              ...msg.toObject(),
              content: signedUrl
            };
          } catch (error) {
            console.error('Error generating signed URL:', error);
            // Return original content if signed URL generation fails
            return msg.toObject();
          }
        }
        return msg.toObject();
      })
    );

    return messagesWithSignedUrls;
  }

  async getMessagesPaginated(conversationId: string, userId: string, schoolId: any, page: number = 1, limit: number = 50): Promise<{ messages: any[], total: number, hasMore: boolean }> {
    const convo = await this.conversationModel.findById(conversationId);
    const schoolIdStr = schoolId && schoolId.toString ? schoolId.toString() : schoolId;
    if (!convo || (convo.schoolId && convo.schoolId.toString() !== schoolIdStr)) throw new NotFoundException('Conversation not found');
    const participantIds = convo.participants.map(p => p.toString());
    const userIdStr = userId.toString();
    if (!participantIds.includes(userIdStr)) throw new BadRequestException('Not a participant');
    
    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      this.messageModel
        .find({ conversationId: new Types.ObjectId(conversationId) })
        .sort({ createdAt: 1 }) // Changed to ascending order (oldest first)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.messageModel.countDocuments({ conversationId: new Types.ObjectId(conversationId) })
    ]);

    // Generate signed URLs for file messages
    const messagesWithSignedUrls = await Promise.all(
      messages.map(async (msg) => {
        if (msg.type !== 'text' && msg.content) {
          try {
            const s3Key = this.awsService.extractS3Key(msg.content);
            const signedUrl = await this.awsService.generateDownloadSignedUrl(s3Key, 3600); // 1 hour expiry
            return {
              ...msg.toObject(),
              content: signedUrl
            };
          } catch (error) {
            console.error('Error generating signed URL:', error);
            // Return original content if signed URL generation fails
            return msg.toObject();
          }
        }
        return msg.toObject();
      })
    );

    return {
      messages: messagesWithSignedUrls, // Already in correct order (oldest first)
      total,
      hasMore: skip + limit < total
    };
  }

  async upsertConversation(userA: string, userB: string, schoolId: any): Promise<ConversationDocument> {
    if (!schoolId) {
      throw new BadRequestException('School ID is required for conversation');
    }
    
    const schoolIdStr = schoolId && schoolId.toString ? schoolId.toString() : schoolId;
    
    // First try to find existing conversation with schoolId
    let existing = await this.conversationModel.findOne({
      participants: { $all: [new Types.ObjectId(userA), new Types.ObjectId(userB)] },
      schoolId: schoolIdStr
    });
    
    // If not found, try without schoolId (for backward compatibility with old conversations)
    if (!existing) {
      existing = await this.conversationModel.findOne({
        participants: { $all: [new Types.ObjectId(userA), new Types.ObjectId(userB)] }
      });
      
      // If found without schoolId, update it with schoolId
      if (existing && !existing.schoolId) {
        existing.schoolId = schoolIdStr;
        await existing.save();
      }
    }
    
    if (existing) return existing;
    
    return this.conversationModel.create({
      participants: [new Types.ObjectId(userA), new Types.ObjectId(userB)],
      schoolId: schoolIdStr,
      lastMessageAt: new Date()
    });
  }

  async sendMessage(senderId: string, receiverId: string, content: string, schoolId: any, type: string = 'text'): Promise<MessageDocument> {
    if (!content && type === 'text') throw new BadRequestException('Message content required');
    
    // Validate relationship
    const sender = await this.userModel.findById(senderId).exec();
    const receiver = await this.userModel.findById(receiverId).exec();

    if (!sender || !receiver) {
      throw new BadRequestException('Sender or receiver not found');
    }

    // Determine schoolId - if not provided, get it from sender or receiver
    let finalSchoolId = schoolId;
    if (!finalSchoolId || finalSchoolId === null || finalSchoolId === undefined) {
      // Try to get from sender (teacher will have schoolId)
      if (sender.schoolId) {
        finalSchoolId = sender.schoolId;
      } 
      // If sender is parent (no schoolId), get from receiver (teacher)
      else if (receiver.schoolId) {
        finalSchoolId = receiver.schoolId;
      }
      // If both are parents/students, try to get from sender's children (for parent)
      else if (sender.role === 'PARENT' && sender.children && sender.children.length > 0) {
        const firstChild = await this.userModel.findById(sender.children[0]).exec();
        if (firstChild && firstChild.schoolId) {
          finalSchoolId = firstChild.schoolId;
        }
      }
      // If still no schoolId, try receiver's children (for parent)
      else if (receiver.role === 'PARENT' && receiver.children && receiver.children.length > 0) {
        const firstChild = await this.userModel.findById(receiver.children[0]).exec();
        if (firstChild && firstChild.schoolId) {
          finalSchoolId = firstChild.schoolId;
        }
      }
    }

    if (!finalSchoolId) {
      throw new BadRequestException('Unable to determine school for this conversation');
    }

    // Allow parent-teacher communication directly (no validation needed)
    // Only validate parent-student relationship (not parent-teacher)
    if ((sender.role === 'PARENT' && receiver.role === 'STUDENT') || 
        (sender.role === 'STUDENT' && receiver.role === 'PARENT')) {
      const isValidRelationship = await this.validateParentStudentRelationship(
        senderId, receiverId, sender.role, receiver.role
      );
      if (!isValidRelationship) {
        throw new BadRequestException('You can only message your assigned children/parents');
      }
    }
    // Parent-Teacher and Teacher-Parent communication is always allowed
    
    // Sanitize content to prevent XSS
    const sanitizedContent = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    const convo = await this.upsertConversation(senderId, receiverId, finalSchoolId);
    const schoolIdStr = finalSchoolId && finalSchoolId.toString ? finalSchoolId.toString() : finalSchoolId;
    const msg = await this.messageModel.create({
      senderId: new Types.ObjectId(senderId),
      receiverId: new Types.ObjectId(receiverId),
      conversationId: convo._id,
      content: sanitizedContent,
      type,
      isRead: false,
      schoolId: schoolIdStr
    });
    convo.lastMessageId = msg._id as any;
    convo.lastMessageAt = new Date();
    await convo.save();

    return msg;
  }

  async markAsRead(messageId: string, userId: string): Promise<MessageDocument> {
    const msg = await this.messageModel.findById(messageId);
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.receiverId.toString() !== userId) throw new BadRequestException('Only receiver can mark read');
    msg.isRead = true;
    msg.readAt = new Date();
    return msg.save();
  }

  async markConversationAsRead(conversationId: string, userId: string): Promise<void> {
    await this.messageModel.updateMany(
      { 
        conversationId: new Types.ObjectId(conversationId),
        receiverId: new Types.ObjectId(userId),
        isRead: false
      },
      { 
        isRead: true,
        readAt: new Date()
      }
    );
  }

  async getMessageById(messageId: string): Promise<MessageDocument | null> {
    return this.messageModel.findById(messageId).exec();
  }

  async validateParticipant(conversationId: string, userId: string, schoolId: string): Promise<boolean> {
    const convo = await this.conversationModel.findById(conversationId);
    if (!convo) return false;
    if (convo.schoolId !== schoolId) return false;
    const participantIds = convo.participants.map(p => p.toString());
    const userIdStr = userId.toString();
    return participantIds.includes(userIdStr);
  }

  async clearChat(conversationId: string, userId: string, schoolId: any): Promise<{ success: boolean; deletedCount: number }> {
    const convo = await this.conversationModel.findById(conversationId);
    if (!convo) throw new NotFoundException('Conversation not found');

    const participantIds = convo.participants.map(p => p.toString());
    const userIdStr = userId.toString();
    if (!participantIds.includes(userIdStr)) {
      throw new BadRequestException('Not a participant');
    }
    const requester = await this.userModel.findById(userId).select('role children').lean().exec();
    const isParent = requester?.role === 'PARENT';
    if (!isParent) {
      const schoolIdStr = schoolId && schoolId.toString ? schoolId.toString() : schoolId;
      if (schoolIdStr && convo.schoolId && convo.schoolId.toString() !== schoolIdStr) {
        throw new NotFoundException('Conversation not found');
      }
    } else if (convo.schoolId) {
      const childrenIds = (requester as any)?.children || [];
      if (Array.isArray(childrenIds) && childrenIds.length > 0) {
        const children = await this.userModel.find({ _id: { $in: childrenIds } }).select('schoolId').lean().exec();
        const allowedSchoolIds = new Set(children.map((c: any) => c.schoolId?.toString()).filter(Boolean));
        if (allowedSchoolIds.size > 0 && !allowedSchoolIds.has(convo.schoolId.toString())) {
          throw new NotFoundException('Conversation not found');
        }
      }
    }

    // Delete all messages in the conversation
    const result = await this.messageModel.deleteMany({
      conversationId: new Types.ObjectId(conversationId)
    });

    // Update conversation's last message
    convo.lastMessageId = null;
    convo.lastMessageAt = new Date();
    await convo.save();

    return { success: true, deletedCount: result.deletedCount };
  }

  async searchMessages(conversationId: string, userId: string, schoolId: any, query: string): Promise<any[]> {
    const convo = await this.conversationModel.findById(conversationId);
    if (!convo) throw new NotFoundException('Conversation not found');

    const participantIds = convo.participants.map(p => p.toString());
    const userIdStr = userId.toString();
    if (!participantIds.includes(userIdStr)) {
      throw new BadRequestException('Not a participant');
    }
    const schoolIdStr = schoolId && schoolId.toString ? schoolId.toString() : schoolId;
    if (schoolIdStr && convo.schoolId && convo.schoolId.toString() !== schoolIdStr) {
      throw new NotFoundException('Conversation not found');
    }

    return this.messageModel
      .find({
        conversationId: new Types.ObjectId(conversationId),
        content: { $regex: query, $options: 'i' }
      })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  async updateLastSeen(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { lastSeen: new Date() });
  }

  async uploadFileAndSendMessage(
    senderId: string,
    receiverId: string,
    file: UploadedFileType,
    schoolId: any,
    type: string = 'file'
  ): Promise<MessageDocument> {
    // Get sender and receiver to determine folder structure
    const sender = await this.userModel.findById(senderId).exec();
    const receiver = await this.userModel.findById(receiverId).exec();
    
    if (!sender || !receiver) {
      throw new NotFoundException('Sender or receiver not found');
    }

    // Determine schoolId - if not provided, get it from sender or receiver (same logic as sendMessage)
    let finalSchoolId = schoolId;
    if (!finalSchoolId || finalSchoolId === null || finalSchoolId === undefined) {
      // Try to get from sender (teacher will have schoolId)
      if (sender.schoolId) {
        finalSchoolId = sender.schoolId;
      } 
      // If sender is parent (no schoolId), get from receiver (teacher)
      else if (receiver.schoolId) {
        finalSchoolId = receiver.schoolId;
      }
      // If both are parents/students, try to get from sender's children (for parent)
      else if (sender.role === 'PARENT' && sender.children && sender.children.length > 0) {
        const firstChild = await this.userModel.findById(sender.children[0]).exec();
        if (firstChild && firstChild.schoolId) {
          finalSchoolId = firstChild.schoolId;
        }
      }
      // If still no schoolId, try receiver's children (for parent)
      else if (receiver.role === 'PARENT' && receiver.children && receiver.children.length > 0) {
        const firstChild = await this.userModel.findById(receiver.children[0]).exec();
        if (firstChild && firstChild.schoolId) {
          finalSchoolId = firstChild.schoolId;
        }
      }
    }

    if (!finalSchoolId) {
      throw new BadRequestException('Unable to determine school for this conversation');
    }

    // Determine folder structure based on roles
    let folderPath = '';
    const schoolIdStr = finalSchoolId && finalSchoolId.toString ? finalSchoolId.toString() : finalSchoolId;
    
    if ((sender.role === 'STUDENT' && receiver.role === 'TEACHER') || 
        (sender.role === 'TEACHER' && receiver.role === 'STUDENT')) {
      folderPath = `${schoolIdStr}/chat/student-teacher/${senderId}-${receiverId}/`;
    } else if ((sender.role === 'PARENT' && receiver.role === 'TEACHER') || 
               (sender.role === 'TEACHER' && receiver.role === 'PARENT')) {
      folderPath = `${schoolIdStr}/chat/parent-teacher/${senderId}-${receiverId}/`;
    } else {
      folderPath = `${schoolIdStr}/chat/other/${senderId}-${receiverId}/`;
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${timestamp}-${file.originalname}`;
    const s3Key = `${folderPath}${fileName}`;

    // Upload to AWS S3
    try {
      const fileUrl = await this.awsService.uploadFile(s3Key, file.buffer, file.mimetype);
      
      // Send message with S3 URL (use finalSchoolId)
      return this.sendMessage(senderId, receiverId, fileUrl, finalSchoolId, type);
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      throw new BadRequestException('Failed to upload file');
    }
  }

  private async validateParentStudentRelationship(
    userId1: string, 
    userId2: string, 
    role1: string, 
    role2: string
  ): Promise<boolean> {
    const parentId = role1 === 'PARENT' ? userId1 : userId2;
    const studentId = role1 === 'STUDENT' ? userId1 : userId2;
    
    const parentUser = await this.userModel.findById(parentId).exec();
    const studentUser = await this.userModel.findById(studentId).exec();
    
    if (!parentUser || !studentUser) return false;
    
    // Check if student is in parent's children array
    const childrenIds = parentUser.children?.map(c => c.toString()) || [];
    return childrenIds.includes(studentId);
  }
}


