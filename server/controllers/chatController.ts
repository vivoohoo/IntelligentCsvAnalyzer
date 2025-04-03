import { Request, Response } from "express";
// Extended request type with file property
interface FileRequest extends Request {
  file?: any;
}
import { storage } from "../database-storage";
import { processCSV } from "../services/csvService";

// Process a file and prompt
export const processFileAndPrompt = async (req: FileRequest, res: Response) => {
  try {
    const message = req.body.message;
    const file = req.file;
    const chatHistory = req.body.chat_history ? JSON.parse(req.body.chat_history) : [];

    if (!message) {
      return res.status(400).json({
        error: "Please provide a message or question."
      });
    }

    // Process file if provided
    let csvData = null;
    let fileName = null;
    
    if (file) {
      fileName = file.originalname;
      
      // Validate file type
      if (!fileName.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({
          error: "Please upload a CSV file."
        });
      }
      
      // Save file reference in storage
      const uploadedFile = await storage.saveFile({
        name: fileName,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        buffer: file.buffer
      });
      
      // Process the CSV data
      csvData = file.buffer;
    }
    
    // Process the prompt with the CSV data
    const response = await processCSV(csvData, message, chatHistory);
    
    // Store the conversation in chat history
    const chatSession = await storage.saveChatMessage({
      prompt: message,
      response: response,
      fileName: fileName,
      timestamp: new Date().toISOString()
    });
    
    return res.status(200).json({
      success: true,
      response: response,
      sessionId: chatSession.id
    });
  } catch (error) {
    console.error('Error processing file and prompt:', error);
    return res.status(500).json({
      error: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
};

// Get chat history
export const getChatHistory = async (req: Request, res: Response) => {
  try {
    const history = await storage.getChatHistory();
    
    return res.status(200).json(history);
  } catch (error) {
    console.error('Error getting chat history:', error);
    return res.status(500).json({
      error: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
};

// Clear chat history
export const clearChatHistory = async (req: Request, res: Response) => {
  try {
    await storage.clearChatHistory();
    
    return res.status(200).json({
      success: true,
      message: "Chat history cleared successfully."
    });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    return res.status(500).json({
      error: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
};
