import { MongoClient } from 'mongodb';

async function addCommunicationIndexes() {
  const client = new MongoClient(
    process.env.MONGO_URI ||
      process.env.MONGODB_CONNECTION_URL ||
      'mongodb://localhost:27017/srs',
  );
  
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    
    const db = client.db();
    
    // Message indexes
    console.log('Creating message indexes...');
    
    // Index for conversation messages (most common query)
    await db.collection('messages').createIndex(
      { conversationId: 1, createdAt: -1 },
      { name: 'conversation_messages_idx' }
    );
    
    // Index for school-based message queries
    await db.collection('messages').createIndex(
      { schoolId: 1, createdAt: -1 },
      { name: 'school_messages_idx' }
    );
    
    // Index for unread message queries
    await db.collection('messages').createIndex(
      { receiverId: 1, isRead: 1 },
      { name: 'unread_messages_idx' }
    );
    
    // Index for sender-based queries
    await db.collection('messages').createIndex(
      { senderId: 1, createdAt: -1 },
      { name: 'sender_messages_idx' }
    );
    
    // Conversation indexes
    console.log('Creating conversation indexes...');
    
    // Index for participant-based conversation queries
    await db.collection('conversations').createIndex(
      { participants: 1, schoolId: 1 },
      { name: 'participant_conversations_idx' }
    );
    
    // Index for school-based conversation queries
    await db.collection('conversations').createIndex(
      { schoolId: 1, lastMessageAt: -1 },
      { name: 'school_conversations_idx' }
    );
    
    // Index for last message queries
    await db.collection('conversations').createIndex(
      { lastMessageId: 1 },
      { name: 'last_message_idx' }
    );
    
    console.log('All indexes created successfully!');
    
    // Display index information
    console.log('\nMessage indexes:');
    const messageIndexes = await db.collection('messages').listIndexes().toArray();
    messageIndexes.forEach(index => {
      console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
    });
    
    console.log('\nConversation indexes:');
    const conversationIndexes = await db.collection('conversations').listIndexes().toArray();
    conversationIndexes.forEach(index => {
      console.log(`- ${index.name}: ${JSON.stringify(index.key)}`);
    });
    
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
if (require.main === module) {
  addCommunicationIndexes()
    .then(() => {
      console.log('Index creation completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { addCommunicationIndexes };

