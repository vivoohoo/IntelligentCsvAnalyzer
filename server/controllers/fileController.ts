import { Request, Response } from "express";
// Extended request type with file property
interface FileRequest extends Request {
  file?: any;
}
import { storage } from "../database-storage.js";

// Upload a file
export const uploadFile = async (req: FileRequest, res: Response) => {
  try {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({
        error: "No file uploaded."
      });
    }
    
    // Validate file type
    const fileName = file.originalname;
    if (!fileName.toLowerCase().endsWith('.csv')) {
      return res.status(400).json({
        error: "Please upload a CSV file."
      });
    }
    
    // Save file to storage
    const uploadedFile = await storage.saveFile({
      name: fileName,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      buffer: file.buffer
    });
    
    return res.status(200).json({
      success: true,
      file: {
        id: uploadedFile.id,
        name: uploadedFile.name,
        size: uploadedFile.size,
        uploadedAt: uploadedFile.uploadedAt
      }
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    return res.status(500).json({
      error: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
};

// Get file info
export const getFileInfo = async (req: Request, res: Response) => {
  try {
    const fileId = req.params.id;
    
    if (!fileId) {
      return res.status(400).json({
        error: "File ID is required."
      });
    }
    
    // Get file from storage
    const file = await storage.getFile(fileId);
    
    if (!file) {
      return res.status(404).json({
        error: "File not found."
      });
    }
    
    return res.status(200).json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        size: file.size,
        uploadedAt: file.uploadedAt
      }
    });
  } catch (error) {
    console.error('Error getting file info:', error);
    return res.status(500).json({
      error: `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
};
