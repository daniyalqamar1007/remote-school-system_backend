import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { CommunicationService } from './communication.service';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AwsService } from '../aws/aws.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})

export class CommunicationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CommunicationGateway.name);
  private connectedUsers = new Map<string, string>(); // socketId -> userId

  constructor(
    private readonly jwtService: JwtService,
    private readonly communicationService: CommunicationService,
    private readonly configService: ConfigService,
    private readonly awsService: AwsService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract JWT token from handshake
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      
      if (!token) {
        this.logger.warn('Connection rejected: No token provided');
        client.disconnect();
        return;
      }

      // Verify JWT token with same secret as auth module
      const jwtSecret = this.configService.get<string>('JWT_SECRET') || 'defaultSecret123!@#';
      const payload = this.jwtService.verify(token, { secret: jwtSecret });
      const userId = payload.sub || payload._id;
      let schoolId = payload.schoolId;

      if (!userId) {
        this.logger.warn('Connection rejected: Invalid token payload - no userId');
        client.disconnect();
        return;
      }

      // For parents, schoolId might not be in token - we'll get it from their children if needed
      // For now, allow connection even without schoolId (we'll handle it in message sending)
      if (!schoolId && payload.role !== 'PARENT') {
        this.logger.warn('Connection rejected: Invalid token payload - no schoolId for non-parent user');
        client.disconnect();
        return;
      }

      // Store user connection
      this.connectedUsers.set(client.id, userId);
      client.data = { userId, schoolId };
      
      // Update last seen
      await this.communicationService.updateLastSeen(userId);
      
      this.logger.log(`User ${userId} connected with socket ${client.id}`);
      
      // Join user to their personal room for notifications
      client.join(`user_${userId}`);
      
    } catch (error) {
      this.logger.error('Connection error:', error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = this.connectedUsers.get(client.id);
    if (userId) {
      this.logger.log(`User ${userId} disconnected`);
      this.connectedUsers.delete(client.id);
    }
  }

  @SubscribeMessage('join_conversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    try {
      const { userId, schoolId } = client.data;
      const { conversationId } = data;

      // Validate user can access this conversation (schoolId can be null for parents)
      await this.validateConversationAccess(conversationId, userId, schoolId || null);

      // Join conversation room
      client.join(`conversation_${conversationId}`);
      
      this.logger.log(`User ${userId} joined conversation ${conversationId}`);
      
      return { success: true };
    } catch (error) {
      this.logger.error('Join conversation error:', error);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('leave_conversation')
  async handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string },
  ) {
    const { conversationId } = data;
    client.leave(`conversation_${conversationId}`);
    
    this.logger.log(`User ${client.data.userId} left conversation ${conversationId}`);
    return { success: true };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { receiverId: string; content: string; type?: string },
  ) {
    try {
      const { userId, schoolId } = client.data;
      const { receiverId, content, type = 'text' } = data;

      // Validate message content
      if (!content || content.trim().length === 0) {
        throw new BadRequestException('Message content is required');
      }

      if (content.length > 5000) {
        throw new BadRequestException('Message too long (max 5000 characters)');
      }

      // For parents, schoolId might be null - sendMessage will determine it from children
      // Send message via service (schoolId can be null/undefined for parents)
      const message = await this.communicationService.sendMessage(
        userId,
        receiverId,
        content,
        schoolId || null, // Allow null for parents
        type,
      );

      // Get conversation ID from the message
      const conversationId = message.conversationId.toString();

      // Generate signed URL for file messages
      let messageContent = message.content;
      if (message.type !== 'text' && message.content) {
        try {
          const s3Key = this.awsService.extractS3Key(message.content);
          messageContent = await this.awsService.generateDownloadSignedUrl(s3Key, 3600); // 1 hour expiry
        } catch (error) {
          this.logger.error('Error generating signed URL for socket message:', error);
          // Use original content if signed URL generation fails
        }
      }

      // Emit message to conversation room (for users who have joined the conversation)
      this.server.to(`conversation_${conversationId}`).emit('new_message', {
        message: {
          _id: message._id,
          senderId: message.senderId,
          receiverId: message.receiverId,
          content: messageContent,
          type: message.type,
          createdAt: message.createdAt, // Use actual message timestamp
          isRead: message.isRead,
        },
        conversationId,
      });

      // Also emit to receiver's personal room (in case they haven't joined the conversation room yet)
      this.server.to(`user_${receiverId}`).emit('new_message', {
        message: {
          _id: message._id,
          senderId: message.senderId,
          receiverId: message.receiverId,
          content: messageContent,
          type: message.type,
          createdAt: message.createdAt,
          isRead: message.isRead,
        },
        conversationId,
      });

      // Emit to sender for confirmation
      client.emit('message_sent', { messageId: message._id });

      this.logger.log(`Message sent from ${userId} to ${receiverId}`);

      return { success: true, messageId: message._id };
    } catch (error) {
      this.logger.error('Send message error:', error);
      return { success: false, error: error.message };
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean },
  ) {
    const { userId } = client.data;
    const { conversationId, isTyping } = data;

    // Emit typing indicator to conversation room (excluding sender)
    client.to(`conversation_${conversationId}`).emit('user_typing', {
      userId,
      conversationId,
      isTyping,
    });

    return { success: true };
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageId: string },
  ) {
    try {
      const { userId } = client.data;
      const { messageId } = data;

      await this.communicationService.markAsRead(messageId, userId);

      // Emit read receipt to conversation
      const message = await this.communicationService.getMessageById(messageId);
      if (message) {
        this.server.to(`conversation_${message.conversationId}`).emit('message_read', {
          messageId,
          readBy: userId,
          readAt: new Date(),
        });
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Mark read error:', error);
      return { success: false, error: error.message };
    }
  }

  // Helper method to validate conversation access
  private async validateConversationAccess(conversationId: string, userId: string, schoolId: string | null | undefined) {
    try {
      // getConversations handles parents properly (gets conversations from all children schools)
      // schoolId can be null for parents, and getConversations will handle it
      const conversations = await this.communicationService.getConversations(userId, schoolId);
      const hasAccess = conversations.some(conv => conv._id.toString() === conversationId);
      
      if (!hasAccess) {
        throw new BadRequestException('Access denied to conversation');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Invalid conversation');
    }
  }

  // Method to emit events from service
  async emitNewMessage(conversationId: string, message: any) {
    this.server.to(`conversation_${conversationId}`).emit('new_message', {
      message,
      conversationId,
    });
  }

  async emitMessageRead(conversationId: string, messageId: string, readBy: string) {
    this.server.to(`conversation_${conversationId}`).emit('message_read', {
      messageId,
      readBy,
      readAt: new Date(),
    });
  }
}
