import { 
  users, type User, type InsertUser, 
  csvFiles, type CsvFile, type InsertCsvFile,
  chatSessions, type ChatSession, type InsertChatSession, 
  chatMessages, type ChatMessage, type InsertChatMessage
} from "../shared/schema.js";
import { IStorage } from "./storage.js";
import { db } from "./db.js";
import { eq, desc, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from 'uuid';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { join } from 'path';

// Define the interface for uploaded files (matching the existing interface)
interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  buffer: Buffer;
  fileType?: string; // Add support for Excel files
}

// Interface for chat message requests (matching the existing interface)
interface ChatMessageRequest {
  prompt: string;
  response: string;
  fileName?: string | null;
  timestamp: string;
}

// Interface for chat sessions (matching the existing interface)
interface ChatSessionResponse {
  id: string;
  title: string;
  messages: Array<{
    content: string;
    isUser: boolean;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

// Directory to store uploaded files
const UPLOADS_DIR = './uploads';

// Ensure uploads directory exists
(async () => {
  try {
    await mkdir(UPLOADS_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating uploads directory:', error);
  }
})();

// Database-based storage implementation
export class DatabaseStorage implements IStorage {
  // User methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // File methods
  async saveFile(file: Omit<UploadedFile, 'id'>): Promise<UploadedFile> {
    // Determine the file type/extension
    const fileType = file.fileType || 'csv';
    
    // Generate a unique filename with the correct extension
    const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}.${fileType}`;
    const filepath = join(UPLOADS_DIR, filename);
    
    // Write the file to disk
    await writeFile(filepath, file.buffer);
    
    // Map file type to mimetype
    let mimetype: string;
    switch (fileType) {
      case 'xlsx':
        mimetype = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'xls':
        mimetype = 'application/vnd.ms-excel';
        break;
      case 'csv':
      default:
        mimetype = 'text/csv';
    }
    
    // Store file metadata in the database
    const fileData: InsertCsvFile = {
      filename,
      originalName: file.name,
      size: file.size,
      mimetype, // Use the determined mimetype
      userId: null,
      metadata: {
        rowCount: 0, // We would calculate this from the actual file
        columnCount: 0,
        columns: {}
      }
    };
    
    const [savedFile] = await db.insert(csvFiles).values(fileData).returning();
    
    // Return the file info in the format expected by the interface
    return {
      id: String(savedFile.id),
      name: file.name,
      size: file.size,
      uploadedAt: savedFile.uploadedAt?.toISOString() || new Date().toISOString(),
      buffer: file.buffer,
      fileType: fileType // Include the file type in the response
    };
  }

  async getFile(id: string): Promise<UploadedFile | undefined> {
    // Get file metadata from the database
    const [fileData] = await db.select().from(csvFiles).where(eq(csvFiles.id, parseInt(id)));
    
    if (!fileData) {
      return undefined;
    }
    
    try {
      // Read the file from disk
      const buffer = await readFile(join(UPLOADS_DIR, fileData.filename));
      
      // Determine file type from filename or mimetype
      let fileType: string = 'csv'; // Default
      const filenameParts = fileData.filename.split('.');
      if (filenameParts.length > 1) {
        fileType = filenameParts[filenameParts.length - 1];
      } else if (fileData.mimetype.includes('sheet')) {
        fileType = 'xlsx';
      } else if (fileData.mimetype.includes('excel')) {
        fileType = 'xls';
      }
      
      return {
        id: String(fileData.id),
        name: fileData.originalName,
        size: fileData.size,
        uploadedAt: fileData.uploadedAt?.toISOString() || new Date().toISOString(),
        buffer,
        fileType
      };
    } catch (error) {
      console.error(`Error reading file ${fileData.filename}:`, error);
      return undefined;
    }
  }

  // Chat methods
  async saveChatMessage(message: ChatMessageRequest): Promise<ChatSessionResponse> {
    // Get the active session or create a new one
    let session: ChatSession;
    const existingSessions = await db.select().from(chatSessions).orderBy(desc(chatSessions.updatedAt)).limit(1);
    
    if (existingSessions.length === 0) {
      // Create a new session
      const sessionData: InsertChatSession = {
        title: message.prompt.substring(0, 30) + (message.prompt.length > 30 ? '...' : ''),
        userId: null, // In a real app, we'd set the user ID
        fileId: null  // If there's a file associated, we'd set it here
      };
      
      const [newSession] = await db.insert(chatSessions).values(sessionData).returning();
      session = newSession;
    } else {
      session = existingSessions[0];
      
      // Update the session's updatedAt timestamp
      await db.update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, session.id));
        
      // Refresh the session data
      const [updatedSession] = await db.select().from(chatSessions).where(eq(chatSessions.id, session.id));
      session = updatedSession;
    }
    
    // Add the user message
    await db.insert(chatMessages).values({
      sessionId: session.id,
      content: message.prompt,
      isUser: true,
      metadata: {
        queryType: "",
        columnReferences: [],
        confidenceScore: 0
      }
    });
    
    // Add the bot response
    await db.insert(chatMessages).values({
      sessionId: session.id,
      content: message.response,
      isUser: false,
      metadata: {
        queryType: "",
        columnReferences: [],
        confidenceScore: 0
      }
    });
    
    // Get the full session with messages
    const fullSession = await this.getChatSession(String(session.id));
    if (!fullSession) {
      throw new Error('Failed to retrieve session after saving chat message');
    }
    
    return fullSession;
  }

  async getChatHistory(): Promise<ChatSessionResponse[]> {
    // Get all sessions ordered by latest updated
    const sessions = await db.select().from(chatSessions).orderBy(desc(chatSessions.updatedAt));
    
    // For each session, get the messages
    const result = await Promise.all(
      sessions.map(async (session) => {
        const messages = await db.select().from(chatMessages)
          .where(eq(chatMessages.sessionId, session.id))
          .orderBy(chatMessages.timestamp);
        
        return {
          id: String(session.id),
          title: session.title,
          messages: messages.map(msg => ({
            content: msg.content,
            isUser: msg.isUser,
            timestamp: msg.timestamp?.toISOString() || new Date().toISOString()
          })),
          createdAt: session.createdAt?.toISOString() || new Date().toISOString(),
          updatedAt: session.updatedAt?.toISOString() || new Date().toISOString()
        };
      })
    );
    
    return result;
  }

  async getChatSession(id: string): Promise<ChatSessionResponse | undefined> {
    // Get the session
    const [session] = await db.select().from(chatSessions).where(eq(chatSessions.id, parseInt(id)));
    
    if (!session) {
      return undefined;
    }
    
    // Get the messages for this session
    const messages = await db.select().from(chatMessages)
      .where(eq(chatMessages.sessionId, session.id))
      .orderBy(chatMessages.timestamp);
    
    return {
      id: String(session.id),
      title: session.title,
      messages: messages.map(msg => ({
        content: msg.content,
        isUser: msg.isUser,
        timestamp: msg.timestamp?.toISOString() || new Date().toISOString()
      })),
      createdAt: session.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: session.updatedAt?.toISOString() || new Date().toISOString()
    };
  }

  async clearChatHistory(): Promise<void> {
    // Delete all chat messages first due to foreign key constraints
    await db.delete(chatMessages);
    
    // Then delete all chat sessions
    await db.delete(chatSessions);
  }
}

// Export the database storage instance
export const storage = new DatabaseStorage();