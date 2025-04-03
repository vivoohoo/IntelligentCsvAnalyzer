import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/Sidebar";
import ChatContainer from "@/components/ChatContainer";
import { Message, ChatSession } from "@/types";

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentSession, setCurrentSession] = useState<ChatSession>({
    id: "new",
    title: "CSV Analysis Chat",
    messages: []
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();

  // Fetch chat history
  const { data: chatHistory = [] } = useQuery<ChatSession[]>({
    queryKey: ['/api/chat/history'],
    refetchOnWindowFocus: false,
    refetchInterval: false,
    onError: (error) => {
      console.error('Failed to fetch chat history:', error);
      toast({
        title: "Failed to load chat history",
        description: "Your previous conversations couldn't be loaded.",
        variant: "destructive"
      });
    }
  });

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({ message, file }: { message: string, file: File | null }) => {
      setIsProcessing(true);
      
      try {
        const formData = new FormData();
        formData.append('message', message);
        
        if (file) {
          formData.append('file', file);
        }
        
        // Add chat history context if needed
        if (currentSession.messages.length > 0) {
          formData.append('chat_history', JSON.stringify(
            currentSession.messages.map(m => ({
              role: m.isUser ? 'user' : 'assistant',
              content: m.content
            }))
          ));
        }
        
        const response = await fetch('/api/chat', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }
        
        return await response.json();
      } finally {
        setIsProcessing(false);
      }
    },
    onSuccess: (data) => {
      // Add bot message to current session
      const botMessage: Message = {
        id: Date.now().toString(),
        content: data.response,
        timestamp: new Date().toISOString(),
        isUser: false
      };
      
      setCurrentSession(prev => ({
        ...prev,
        messages: [...prev.messages, botMessage]
      }));
      
      // Clear file after successful processing
      setFile(null);
      
      // Update chat history
      queryClient.invalidateQueries({ queryKey: ['/api/chat/history'] });
    },
    onError: (error) => {
      console.error('Error sending message:', error);
      toast({
        title: "Failed to process message",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    }
  });

  // Handle creating a new chat session
  const handleNewChat = () => {
    setCurrentSession({
      id: "new",
      title: "CSV Analysis Chat",
      messages: []
    });
    setFile(null);
  };

  // Handle sending a message
  const handleSendMessage = (message: string) => {
    if (!message.trim()) return;
    
    // Add user message to current session
    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      timestamp: new Date().toISOString(),
      isUser: true
    };
    
    setCurrentSession(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage]
    }));
    
    // Send message to API
    sendMessageMutation.mutate({ message, file });
  };

  // Handle file upload
  const handleFileUpload = (uploadedFile: File | null) => {
    setFile(uploadedFile);
    
    if (uploadedFile) {
      toast({
        title: "File Ready",
        description: `"${uploadedFile.name}" ready to be processed`,
        variant: "default"
      });
    }
  };

  // Toggle sidebar on mobile
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Set example query (for intro message examples)
  const setExampleQuery = (query: string) => {
    handleSendMessage(query);
  };

  // Clear chat history
  const clearHistory = async () => {
    try {
      await apiRequest('DELETE', '/api/chat/history');
      queryClient.invalidateQueries({ queryKey: ['/api/chat/history'] });
      toast({
        title: "History Cleared",
        description: "Your chat history has been cleared successfully.",
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to clear history:', error);
      toast({
        title: "Failed to clear history",
        description: "An error occurred while clearing your chat history.",
        variant: "destructive"
      });
    }
  };

  // Select a chat session from history
  const selectChatSession = (sessionId: string) => {
    const session = chatHistory.find(session => session.id === sessionId);
    if (session) {
      setCurrentSession(session);
      // Close sidebar on mobile after selection
      if (sidebarOpen) {
        setSidebarOpen(false);
      }
    }
  };

  // Generate response for current chat
  const regenerateResponse = () => {
    if (currentSession.messages.length < 2) return;
    
    // Get the last user message
    const lastUserMessage = [...currentSession.messages]
      .reverse()
      .find(m => m.isUser);
      
    if (lastUserMessage) {
      // Remove the last bot message
      setCurrentSession(prev => ({
        ...prev,
        messages: prev.messages.slice(0, -1)
      }));
      
      // Re-send the last user message
      sendMessageMutation.mutate({ 
        message: lastUserMessage.content, 
        file: null 
      });
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-900 font-sans text-gray-900 dark:text-white">
      <div className="container mx-auto h-screen p-2 md:p-4 flex">
        <div className="app-container w-full h-full flex overflow-hidden rounded-lg shadow-xl border border-gray-200 dark:border-gray-700">
          {/* Sidebar Component */}
          <Sidebar 
            isOpen={sidebarOpen} 
            chatHistory={chatHistory}
            currentSessionId={currentSession.id}
            onNewChat={handleNewChat}
            onSelectSession={selectChatSession}
            onClearHistory={clearHistory}
          />
          
          {/* Mobile Sidebar Toggle */}
          <button 
            className="md:hidden absolute top-4 left-4 z-20 bg-white dark:bg-gray-800 rounded-md shadow-md p-2"
            onClick={toggleSidebar}
          >
            <i className="fas fa-bars text-gray-600 dark:text-gray-300"></i>
          </button>
          
          {/* Chat Container Component */}
          <ChatContainer 
            currentSession={currentSession}
            isProcessing={isProcessing || sendMessageMutation.isPending}
            file={file}
            onSendMessage={handleSendMessage}
            onFileUpload={handleFileUpload}
            onRegenerateResponse={regenerateResponse}
            onSetExampleQuery={setExampleQuery}
          />
        </div>
      </div>
    </div>
  );
}
