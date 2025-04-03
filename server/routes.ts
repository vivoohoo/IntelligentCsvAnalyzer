import type { Express } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./database-storage.js";
import { 
  processFileAndPrompt, 
  getChatHistory, 
  clearChatHistory 
} from "./controllers/chatController.js";
import { uploadFile, getFileInfo } from "./controllers/fileController.js";
import { checkNLPAvailability } from "./services/csvService.js";

// Set up multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // API status endpoint
  app.get('/api/status', (req, res) => {
    const nlpAvailable = checkNLPAvailability();
    res.json({
      status: 'ok',
      backend_available: nlpAvailable,
      timestamp: new Date().toISOString()
    });
  });

  // Chat endpoints
  app.post('/api/chat', upload.single('file'), processFileAndPrompt);
  app.get('/api/chat/history', getChatHistory);
  app.delete('/api/chat/history', clearChatHistory);

  // File endpoints
  app.post('/api/files/upload', upload.single('file'), uploadFile);
  app.get('/api/files/:id', getFileInfo);

  const httpServer = createServer(app);
  return httpServer;
}
