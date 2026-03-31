import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';
import { UserRole } from '../../auth/schemas/user.schema';

@Schema({ timestamps: true })
export class User extends Document {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string; // Hashed password

  @Prop({ required: true, enum: UserRole })
  role: UserRole;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Role' }], default: [] })
  customRoles: Types.ObjectId[];

  @Prop({ type: Types.ObjectId, ref: 'School', required: false })
  schoolId: Types.ObjectId;

  @Prop({ required: false })
  phone: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: false })
  isEmailVerified: boolean;

  @Prop({ required: false })
  profilePhoto: string;

  @Prop({ type: Date, required: false })
  lastLogin: Date;

  @Prop({ type: Date, required: false })
  passwordChangedAt: Date;

  @Prop({ default: false })
  mustChangePassword: boolean;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  mfaSettings: {
    isEnabled?: boolean;
    method?: string; // 'email', 'sms', 'authenticator'
    secret?: string;
    backupCodes?: string[];
  };

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  passwordPolicy: {
    minLength?: number;
    requireUppercase?: boolean;
    requireLowercase?: boolean;
    requireNumbers?: boolean;
    requireSpecialChars?: boolean;
    expirationDays?: number;
  };

  @Prop({ type: [String], default: [] })
  loginHistory: string[]; // Store last 10 login timestamps

  @Prop({ default: 0 })
  failedLoginAttempts: number;

  @Prop({ type: Date, required: false })
  accountLockedUntil: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
