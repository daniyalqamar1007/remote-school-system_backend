/**
 * Migration script to fix schoolCode field issues
 * This script will:
 * 1. Remove the old schoolCode_1 index
 * 2. Update existing documents to have proper code values
 * 3. Remove the schoolCode field from documents
 */

const { MongoClient } = require('mongodb');

/**
 * Try to connect to one of the provided URIs with retries and exponential backoff.
 * Returns a connected MongoClient.
 */
async function connectWithRetries(uriCandidates = [], options = {}) {
  const maxAttempts = options.maxAttempts || 5;
  const baseDelay = options.baseDelay || 1000; // ms

  let lastError = null;

  for (const uri of uriCandidates) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        console.log(`🔗 Connected to MongoDB at ${uri}`);
        return client;
      } catch (err) {
        lastError = err;
        const wait = baseDelay * Math.pow(2, attempt - 1);
        console.log(`⚠️  Failed to connect to ${uri} (attempt ${attempt}/${maxAttempts}): ${err.message}`);
        if (attempt < maxAttempts) {
          console.log(`⏳ Retrying in ${wait}ms...`);
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }
  }

  // If we get here, all attempts failed
  const guidance = `Could not connect to MongoDB. Please ensure MongoDB is running and reachable.
  - Check your MONGODB_URI environment variable.
  - Try starting MongoDB (e.g., on Windows: "Services -> MongoDB" or run mongod).
  - Common default URIs tried: ${uriCandidates.join(', ')}
  `;

  // Attach guidance to the original error and throw
  const err = new Error(`MongoDB connection failed. ${guidance}`);
  err.original = lastError;
  throw err;
}

async function migrateSchoolCodes() {
  // Determine candidate URIs: prefer common env vars (Atlas) then fallback to local hosts
  const envCandidates = [
    process.env.MONGODB_URI,
    process.env.MONGO_URI,
    process.env.MONGODB_CONNECTION_URL,
    process.env.MONGO_CONNECTION_URL,
  ].filter(Boolean).map(s => s.trim());

  const candidates = [];
  // Prefer environment-provided connection strings (Atlas)
  if (envCandidates.length > 0) {
    console.log('🔎 Found MongoDB URI in environment variables. Will try those first.');
    envCandidates.forEach((u, i) => console.log(`  ${i + 1}. ${u.startsWith('mongodb+srv') ? 'mongodb+srv://<REDACTED>' : u}`));
    candidates.push(...envCandidates);
  }
  // Try explicit IPv4 first to avoid IPv6 resolution issues
  candidates.push('mongodb://127.0.0.1:27017/srs');
  candidates.push('mongodb://localhost:27017/srs');

  let client;
  try {
  client = await connectWithRetries(candidates, { maxAttempts: 3, baseDelay: 1000 });

  // If the client options contain dbName use it, otherwise default to 'srs'
  const dbName = (client && client.s && client.s.options && client.s.options.dbName) || 'srs';
    const db = client.db(dbName);
    const schoolsCollection = db.collection('schools');

    // Step 1: Check existing indexes
    console.log('📋 Checking existing indexes...');
    const indexes = await schoolsCollection.indexes();
    console.log('Existing indexes:', indexes.map(idx => idx.name));

    // Step 2: Drop the old schoolCode index if it exists
    try {
      const names = indexes.map(i => i.name);
      if (names.includes('schoolCode_1')) {
        await schoolsCollection.dropIndex('schoolCode_1');
        console.log('✅ Dropped old schoolCode_1 index');
      } else {
        console.log('ℹ️  schoolCode_1 index not found or already dropped');
      }
    } catch (error) {
      console.log('⚠️  Error while dropping old index:', error.message);
    }

    // Step 3: Find documents with schoolCode field
    const docsWithSchoolCode = await schoolsCollection.find({ schoolCode: { $exists: true } }).toArray();
    console.log(`📊 Found ${docsWithSchoolCode.length} documents with schoolCode field`);

    // Step 4: Update documents - copy schoolCode to code if code doesn't exist
    for (const doc of docsWithSchoolCode) {
      const updateData = {};
      // If code doesn't exist but schoolCode does, copy it
      if ((!doc.code || doc.code === null) && doc.schoolCode) {
        updateData.code = doc.schoolCode;
        console.log(`📝 Copying schoolCode "${doc.schoolCode}" to code field for ${doc.name || doc._id}`);
      }
      // Remove the old schoolCode field
      const unsetData = { schoolCode: 1 };

      if (Object.keys(updateData).length > 0 || Object.keys(unsetData).length > 0) {
        const updateQuery = {};
        if (Object.keys(updateData).length > 0) updateQuery.$set = updateData;
        if (Object.keys(unsetData).length > 0) updateQuery.$unset = unsetData;

        await schoolsCollection.updateOne({ _id: doc._id }, updateQuery);
        console.log(`✅ Updated document: ${doc.name || doc._id}`);
      }
    }

    // Step 5: Ensure code index exists
    try {
      await schoolsCollection.createIndex({ code: 1 }, { unique: true });
      console.log('✅ Created unique index on code field');
    } catch (error) {
      console.log('ℹ️  Index on code field already exists or failed to create:', error.message);
    }

    // Step 6: Verify the cleanup
    const remainingSchoolCodeDocs = await schoolsCollection.find({ schoolCode: { $exists: true } }).count();
    const nullCodeDocs = await schoolsCollection.find({ code: null }).count();

    console.log(`📊 Documents with schoolCode field remaining: ${remainingSchoolCodeDocs}`);
    console.log(`📊 Documents with null code field: ${nullCodeDocs}`);

    // Step 7: Handle any documents that still have null codes
    if (nullCodeDocs > 0) {
      const nullDocs = await schoolsCollection.find({ code: null }).toArray();
      console.log('🔧 Fixing documents with null codes...');

      for (const doc of nullDocs) {
        // Generate a unique code based on school name or ID
        const generatedCode = `SCHOOL_${doc._id.toString().slice(-8).toUpperCase()}`;

        await schoolsCollection.updateOne(
          { _id: doc._id },
          { $set: { code: generatedCode } }
        );

        console.log(`📝 Generated code "${generatedCode}" for ${doc.name || 'Unnamed School'}`);
      }
    }

    console.log('🎉 Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.original) {
      console.error('🔍 Original error:', error.original.message || error.original);
    }
    throw error;
  } finally {
    if (client) {
      try {
        await client.close();
        console.log('🔒 MongoDB connection closed');
      } catch (closeErr) {
        console.log('⚠️  Error while closing MongoDB connection:', closeErr.message);
      }
    }
  }
}

// Run the migration
if (require.main === module) {
  migrateSchoolCodes()
    .then(() => {
      console.log('✅ School code migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration failed:', error.message);
      // Provide extra help when connection was refused
      if (error.original && error.original.message && error.original.message.includes('ECONNREFUSED')) {
        console.error('🔧 Connection refused. Make sure MongoDB is running and accessible at the configured host.');
      }
      process.exit(1);
    });
}

module.exports = { migrateSchoolCodes };
