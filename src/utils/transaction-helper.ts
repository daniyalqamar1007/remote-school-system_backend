/**
 * Transaction Helper Utility
 * 
 * Provides a safe way to use transactions that gracefully falls back
 * when MongoDB is not configured as a replica set (common in local dev)
 */

import { ClientSession, Connection } from 'mongoose';

export interface TransactionOptions {
  connection: Connection;
  retries?: number;
}

export interface TransactionCallback<T> {
  (session: ClientSession): Promise<T>;
}

/**
 * Execute a function within a transaction, with automatic fallback
 * if transactions are not supported (e.g., single-node MongoDB)
 */
export async function withTransaction<T>(
  callback: TransactionCallback<T>,
  options: TransactionOptions
): Promise<T> {
  const { connection, retries = 1 } = options;
  
  // Try to use transaction
  const session = await connection.startSession();
  
  try {
    session.startTransaction();
    
    try {
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error: any) {
      await session.abortTransaction();
      
      // Check if error is due to transactions not being supported
      if (
        error.code === 20 || // IllegalOperation
        error.codeName === 'IllegalOperation' ||
        error.message?.includes('Transaction numbers are only allowed') ||
        error.message?.includes('not running with --replSet')
      ) {
        console.warn('⚠️  Transactions not supported, falling back to non-transactional mode');
        
        // Retry without transaction
        return await callback(null as any); // Pass null as session to indicate no transaction
      }
      
      throw error;
    }
  } catch (error: any) {
    // If transaction initialization fails, try without transaction
    if (
      error.code === 20 ||
      error.codeName === 'IllegalOperation' ||
      error.message?.includes('Transaction numbers are only allowed') ||
      error.message?.includes('not running with --replSet')
    ) {
      console.warn('⚠️  Transactions not supported, executing without transaction');
      return await callback(null as any);
    }
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Check if transactions are supported
 */
export async function isTransactionSupported(connection: Connection): Promise<boolean> {
  try {
    const session = await connection.startSession();
    session.startTransaction();
    await session.abortTransaction();
    await session.endSession();
    return true;
  } catch (error: any) {
    if (
      error.code === 20 ||
      error.codeName === 'IllegalOperation' ||
      error.message?.includes('Transaction numbers are only allowed') ||
      error.message?.includes('not running with --replSet')
    ) {
      return false;
    }
    throw error;
  }
}

/**
 * Execute callback with session if transactions are supported, otherwise without
 */
export async function withOptionalTransaction<T>(
  callback: (session: ClientSession | null) => Promise<T>,
  connection: Connection
): Promise<T> {
  const supported = await isTransactionSupported(connection);
  
  if (supported) {
    const session = await connection.startSession();
    try {
      session.startTransaction();
      const result = await callback(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } else {
    // Execute without transaction
    return await callback(null);
  }
}



