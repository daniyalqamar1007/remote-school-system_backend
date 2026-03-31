// Quick test script to populate default system settings
const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  description: String,
  isActive: { type: Boolean, default: true },
  isSystem: { type: Boolean, default: false },
  category: String,
  lastModifiedBy: String,
  validationRules: { type: Object }
}, { timestamps: true });

const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);

async function populateSettings() {
  try {
    await mongoose.connect('mongodb://localhost:27017/pludo-school');

    console.log('Connected to MongoDB');

    const defaultSettings = [
      // General Settings
      { key: 'system_name', name: 'System Name', value: 'Student Revelation System', category: 'general', isSystem: true },
      { key: 'system_version', name: 'System Version', value: '1.0.0', category: 'general', isSystem: true },
      { key: 'time_zone', name: 'Time Zone', value: 'UTC', category: 'general' },
      { key: 'date_format', name: 'Date Format', value: 'MM/DD/YYYY', category: 'general' },
      { key: 'maintenance_mode', name: 'Maintenance Mode', value: false, category: 'general' },
      
      // Email Settings
      { key: 'email_enabled', name: 'Email Enabled', value: true, category: 'email' },
      { key: 'smtp_server', name: 'SMTP Server', value: 'smtp.gmail.com', category: 'email' },
      { key: 'smtp_port', name: 'SMTP Port', value: 587, category: 'email' },
      { key: 'from_email', name: 'From Email', value: 'noreply@srs.com', category: 'email' },
      
      // Security Settings
      { key: 'password_expiry_days', name: 'Password Expiry Days', value: 90, category: 'security' },
      { key: 'max_login_attempts', name: 'Max Login Attempts', value: 5, category: 'security' },
      { key: 'session_timeout', name: 'Session Timeout (minutes)', value: 30, category: 'security' },
      { key: 'mfa_required', name: 'MFA Required', value: false, category: 'security' },
      
      // Branding Settings
      { key: 'organization_name', name: 'Organization Name', value: 'Your School District', category: 'branding' },
      { key: 'primary_color', name: 'Primary Color', value: '#3b82f6', category: 'branding' },
      { key: 'secondary_color', name: 'Secondary Color', value: '#64748b', category: 'branding' },
      
      // Notification Settings
      { key: 'email_notifications', name: 'Email Notifications', value: true, category: 'notifications' },
      { key: 'sms_notifications', name: 'SMS Notifications', value: false, category: 'notifications' },
      { key: 'push_notifications', name: 'Push Notifications', value: true, category: 'notifications' }
    ];

    // Clear existing settings
    await SystemConfig.deleteMany({});

    // Insert default settings
    await SystemConfig.insertMany(defaultSettings.map(setting => ({
      ...setting,
      lastModifiedBy: 'system'
    })));

    console.log(`✅ Created ${defaultSettings.length} default system settings`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

populateSettings();
