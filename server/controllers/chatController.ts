import { Request, Response } from "express";
// Extended request type with file property
interface FileRequest extends Request {
  file?: any;
}
import { storage } from "../database-storage.js";
import { processCSV } from "../services/csvService.js";

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
    let fileData = null;
    let fileName = null;
    let fileType = 'csv'; // Default file type
    
    if (file) {
      fileName = file.originalname;
      const fileName_lower = fileName.toLowerCase();
      
      // Validate file type
      if (fileName_lower.endsWith('.csv')) {
        fileType = 'csv';
      } else if (fileName_lower.endsWith('.xlsx')) {
        fileType = 'xlsx';
      } else if (fileName_lower.endsWith('.xls')) {
        fileType = 'xls';
      } else {
        return res.status(400).json({
          error: "Please upload a CSV or Excel file (.csv, .xlsx, .xls)."
        });
      }
      
      // Save file reference in storage
      const uploadedFile = await storage.saveFile({
        name: fileName,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        buffer: file.buffer,
        fileType: fileType
      });
      
      // Process the file data
      fileData = file.buffer;
    }
    
    // Process the prompt with the file data
    const response = await processCSV(fileData, message, chatHistory, fileType);
    
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
