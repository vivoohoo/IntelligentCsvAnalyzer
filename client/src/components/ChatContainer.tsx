import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MessageItem from "@/components/MessageItem";
import FileUpload from "@/components/FileUpload";
import { Message, ChatSession } from "@/types";

interface ChatContainerProps {
  currentSession: ChatSession;
  isProcessing: boolean;
  file: File | null;
  onSendMessage: (message: string) => void;
  onFileUpload: (file: File | null) => void;
  onRegenerateResponse: () => void;
  onSetExampleQuery: (query: string) => void;
}

export default function ChatContainer({
  currentSession,
  isProcessing,
  file,
  onSendMessage,
  onFileUpload,
  onRegenerateResponse,
  onSetExampleQuery
}: ChatContainerProps) {
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentSession.messages]);
  
  // Auto-adjust textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [message]);
  
  // File upload trigger helper
  const handleTriggerFileUpload = () => {
    // Create a temporary input element and trigger it
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files && target.files[0];
      if (file) {
        const fileName = file.name.toLowerCase();
        const isCSV = file.type === 'text/csv' || fileName.endsWith('.csv');
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
        
        if (!isCSV && !isExcel) {
          alert('Please upload a CSV or Excel file (.csv, .xlsx, .xls).');
          return;
        }
        onFileUpload(file);
      }
    };
    input.click();
  };
  
  // Handle Enter key for sending messages
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isProcessing) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Handle sending a message
  const handleSendMessage = () => {
    if (message.trim() && !isProcessing) {
      onSendMessage(message);
      setMessage("");
      
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };
  
  // Export chat as text
  const exportChat = () => {
    if (currentSession.messages.length === 0) return;
    
    // Format chat messages
    const chatText = currentSession.messages.map(msg => {
      const prefix = msg.isUser ? 'You: ' : 'NxCompanion: ';
      return `${prefix}${msg.content}`;
    }).join('\n\n');
    
    // Create and download file
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSession.title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="chat-container flex-1 flex flex-col h-full overflow-hidden">
      {/* Chat Header */}
      <div className="chat-header bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center">
        <div className="current-chat-title text-lg font-medium truncate">
          {currentSession.title}
        </div>
        <div className="header-actions flex space-x-2">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onRegenerateResponse}
            disabled={currentSession.messages.length < 2 || isProcessing}
            title="Regenerate response"
          >
            <i className="fas fa-sync"></i>
          </Button>
          {isProcessing && (
            <Button 
              variant="ghost" 
              size="icon"
              title="Stop generating"
            >
              <i className="fas fa-stop"></i>
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="icon"
            onClick={exportChat}
            disabled={currentSession.messages.length === 0}
            title="Export conversation"
          >
            <i className="fas fa-download"></i>
          </Button>
        </div>
      </div>
      
      {/* Messages Area */}
      <div className="messages flex-1 overflow-y-auto p-4 space-y-6">
        {/* Welcome Message (shown only when no messages) */}
        {currentSession.messages.length === 0 && (
          <div className="intro-message text-center py-8">
            <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center rounded-full bg-primary-50 text-primary-500">
              <i className="fas fa-robot text-4xl"></i>
            </div>
            <h1 className="font-heading text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Welcome to NxCompanion</h1>
            <p className="text-gray-600 dark:text-gray-300 max-w-md mx-auto mb-8">
              Upload a CSV or Excel file and ask me anything about your data. I can help analyze sales, count invoices, identify trends, and more.
            </p>
            
            {/* Large File Upload Area */}
            <div className="max-w-lg mx-auto mb-8">
              <FileUpload onFileUpload={onFileUpload} showLabel={true} />
            </div>
            
            {/* Or divider */}
            <div className="flex items-center justify-center max-w-lg mx-auto mb-6">
              <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
              <div className="px-4 text-gray-500 dark:text-gray-400 text-sm">OR</div>
              <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
            </div>
            
            {/* Example queries */}
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Try asking these example questions:</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl mx-auto">
              <div 
                className="example-query bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer p-3 rounded-md text-left text-sm border border-gray-200 dark:border-gray-700"
                onClick={() => onSetExampleQuery("How many invoices are in this file?")}
              >
                "How many invoices are in this file?"
              </div>
              <div 
                className="example-query bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer p-3 rounded-md text-left text-sm border border-gray-200 dark:border-gray-700"
                onClick={() => onSetExampleQuery("Total sales amount for January 2023")}
              >
                "Total sales amount for January 2023"
              </div>
              <div 
                className="example-query bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer p-3 rounded-md text-left text-sm border border-gray-200 dark:border-gray-700"
                onClick={() => onSetExampleQuery("Show me sales trends by month")}
              >
                "Show me sales trends by month"
              </div>
              <div 
                className="example-query bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer p-3 rounded-md text-left text-sm border border-gray-200 dark:border-gray-700"
                onClick={() => onSetExampleQuery("Find customers with most purchases")}
              >
                "Find customers with most purchases"
              </div>
            </div>
          </div>
        )}
        
        {/* Message Items */}
        {currentSession.messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
        
        {/* Auto-scroll reference */}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input Area */}
      <div className="input-area bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4">
        {/* File Preview (when file is selected but not processed) */}
        {file && (
          <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex items-center">
            <i className="fas fa-file-csv text-primary-500 mr-2"></i>
            <span className="text-sm flex-1 truncate">{file.name}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => onFileUpload(null)}
            >
              <i className="fas fa-times"></i>
            </Button>
          </div>
        )}
        
        {/* Current Processing Indicator */}
        {isProcessing && (
          <div className="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md flex items-center">
            <i className="fas fa-spinner fa-spin text-yellow-500 mr-2"></i>
            <span className="text-sm">Processing your data file...</span>
          </div>
        )}
        
        {/* Input Container */}
        <div className="input-container flex items-end bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-2 focus-within:ring-2 focus-within:ring-primary-300 focus-within:border-primary-500">
          {/* Message input area */}
          <Textarea
            id="user-input"
            ref={textareaRef}
            placeholder="Ask anything about your data..."
            rows={1}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 outline-none resize-none text-gray-800 dark:text-gray-200 max-h-32 bg-transparent"
          />
          
          {/* File upload button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerFileUpload}
            className="flex items-center gap-2 text-xs mr-2 text-gray-500 hover:text-primary-500"
          >
            <i className="fas fa-file-csv"></i>
            Upload File
          </Button>
          
          {/* Send button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSendMessage}
            disabled={!message.trim() || isProcessing}
            className="text-primary-500 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            <i className="fas fa-paper-plane"></i>
          </Button>
        </div>
        
        {/* Disclaimer */}
        <div className="disclaimer text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
          NxCompanion can make mistakes. Please verify important information.
        </div>
      </div>
    </div>
  );
}
