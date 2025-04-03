// Message represents a single chat message
export interface Message {
  id: string;
  content: string;
  timestamp: string;
  isUser: boolean;
}

// ChatSession represents a conversation thread
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
}

// UploadedFile represents a file that's been uploaded
export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  uploadedAt: string;
}

// CSVAnalysisResult represents the analysis of a CSV file
export interface CSVAnalysisResult {
  rows: number;
  columns: number;
  columnTypes: Record<string, string>;
  queryClassification?: Record<string, any>;
}

// APIResponse represents a generic response from the API
export interface APIResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: any;
}
