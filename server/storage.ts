import { users, type User, type InsertUser } from "../shared/schema.js";
import { v4 as uuidv4 } from 'uuid';
// Import DB storage implementation from database-storage.ts

// Define interfaces for our storage objects
interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
  buffer: Buffer;
  fileType?: string; // Optional to maintain compatibility with existing files
}

interface ChatMessage {
  prompt: string;
  response: string;
  fileName?: string | null;
  timestamp: string;
}

interface ChatSession {
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

// Storage interface
export interface IStorage {
  // User methods from template
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // File methods
  saveFile(file: Omit<UploadedFile, 'id'>): Promise<UploadedFile>;
  getFile(id: string): Promise<UploadedFile | undefined>;
  
  // Chat methods
  saveChatMessage(message: ChatMessage): Promise<ChatSession>;
  getChatHistory(): Promise<ChatSession[]>;
  getChatSession(id: string): Promise<ChatSession | undefined>;
  clearChatHistory(): Promise<void>;
}

// Memory-based storage implementation
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private files: Map<string, UploadedFile>;
  private chatSessions: Map<string, ChatSession>;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.files = new Map();
    this.chatSessions = new Map();
    this.currentId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { 
      ...insertUser, 
      id, 
      createdAt: new Date() 
    };
    this.users.set(id, user);
    return user;
  }
  
  // File methods
  async saveFile(file: Omit<UploadedFile, 'id'>): Promise<UploadedFile> {
    const id = uuidv4();
    const uploadedFile: UploadedFile = { ...file, id };
    this.files.set(id, uploadedFile);
    return uploadedFile;
  }
  
  async getFile(id: string): Promise<UploadedFile | undefined> {
    return this.files.get(id);
  }
  
  // Chat methods
  async saveChatMessage(message: ChatMessage): Promise<ChatSession> {
    // Create a new session or append to the latest one
    let session: ChatSession;
    
    // If there are no sessions or the latest one has more than 10 messages, create a new one
    const sessions = Array.from(this.chatSessions.values());
    const latestSession = sessions.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )[0];
    
    const createNewSession = !latestSession || latestSession.messages.length >= 20;
    
    if (createNewSession) {
      // Generate a title from the prompt
      const title = message.prompt.length > 30 
        ? message.prompt.substring(0, 30) + '...' 
        : message.prompt;
      
      // Create a new session
      const sessionId = uuidv4();
      session = {
        id: sessionId,
        title,
        messages: [],
        createdAt: message.timestamp,
        updatedAt: message.timestamp
      };
    } else {
      session = latestSession;
    }
    
    // Add user message
    session.messages.push({
      content: message.prompt,
      isUser: true,
      timestamp: message.timestamp
    });
    
    // Add bot message
    session.messages.push({
      content: message.response,
      isUser: false,
      timestamp: message.timestamp
    });
    
    // Update session
    session.updatedAt = message.timestamp;
    this.chatSessions.set(session.id, session);
    
    return session;
  }
  
  async getChatHistory(): Promise<ChatSession[]> {
    // Return sessions sorted by updatedAt (newest first)
    return Array.from(this.chatSessions.values())
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  
  async getChatSession(id: string): Promise<ChatSession | undefined> {
    return this.chatSessions.get(id);
  }
  
  async clearChatHistory(): Promise<void> {
    this.chatSessions.clear();
  }
}

// The implementation of storage is provided in database-storage.ts
