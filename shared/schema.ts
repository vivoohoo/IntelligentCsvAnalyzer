import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// CSV files table
export const csvFiles = pgTable("csv_files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  size: integer("size").notNull(),
  mimetype: text("mimetype").notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  metadata: jsonb("metadata").$type<{
    rowCount: number;
    columnCount: number;
    columns: Record<string, string>;
  }>(),
});

// Chat sessions table
export const chatSessions = pgTable("chat_sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  fileId: integer("file_id").references(() => csvFiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat messages table
export const chatMessages = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => chatSessions.id, { onDelete: "cascade" }).notNull(),
  content: text("content").notNull(),
  isUser: boolean("is_user").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  metadata: jsonb("metadata").$type<{
    queryType?: string;
    columnReferences?: string[];
    confidenceScore?: number;
  }>(),
});

// Define relations
export const usersRelations = relations(users, ({ many }) => ({
  files: many(csvFiles),
  sessions: many(chatSessions),
}));

export const csvFilesRelations = relations(csvFiles, ({ one, many }) => ({
  user: one(users, {
    fields: [csvFiles.userId],
    references: [users.id],
  }),
  sessions: many(chatSessions),
}));

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [chatSessions.userId],
    references: [users.id],
  }),
  file: one(csvFiles, {
    fields: [chatSessions.fileId],
    references: [csvFiles.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertCsvFileSchema = createInsertSchema(csvFiles).pick({
  filename: true,
  originalName: true,
  size: true,
  mimetype: true,
  userId: true,
  metadata: true,
});

export const insertChatSessionSchema = createInsertSchema(chatSessions).pick({
  title: true,
  userId: true,
  fileId: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).pick({
  sessionId: true,
  content: true,
  isUser: true,
  metadata: true,
});

// Types
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertCsvFile = z.infer<typeof insertCsvFileSchema>;
export type CsvFile = typeof csvFiles.$inferSelect;

export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSession = typeof chatSessions.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
