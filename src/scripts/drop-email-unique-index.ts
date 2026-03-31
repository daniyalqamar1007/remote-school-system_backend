import 'dotenv/config';
import mongoose from 'mongoose';

async function run() {
  const uri = process.env.MONGODB_CONNECTION_URL as string;
  if (!uri) {
    console.error('MONGODB_CONNECTION_URL is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, {
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 20000,
  } as any);

  try {
    const db = mongoose.connection.db;
    const indexes = await db.collection('users').indexes();
    const emailIdx = indexes.find((i: any) => i.key && i.key.email === 1);
    if (emailIdx) {
      console.log('Found email index:', emailIdx.name, 'unique:', !!emailIdx.unique);
      if (emailIdx.unique) {
        console.log('Dropping unique index', emailIdx.name, 'on users.email ...');
        await db.collection('users').dropIndex(emailIdx.name);
        console.log('Dropped. Recreating a non-unique email index...');
        await db.collection('users').createIndex({ email: 1 }, { name: 'email_1' });
        console.log('Recreated non-unique index email_1.');
      } else {
        console.log('Email index is already non-unique. No action needed.');
      }
    } else {
      console.log('No email index found. Creating non-unique email_1 index...');
      await db.collection('users').createIndex({ email: 1 }, { name: 'email_1' });
      console.log('Created email_1 index.');
    }
  } catch (err) {
    console.error('Failed to update index:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();


