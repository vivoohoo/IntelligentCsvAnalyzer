// Utility functions for API calls

// Check if the backend services are available
export const checkApiStatus = async (): Promise<{backend_available: boolean}> => {
  try {
    const response = await fetch('/api/status');
    return await response.json();
  } catch (error) {
    console.error('Error checking API status:', error);
    return { backend_available: false };
  }
};

// Send a chat message with optional file
export const sendChatMessage = async (
  message: string, 
  file?: File | null,
  chatHistory?: Array<{role: string, content: string}>
): Promise<any> => {
  try {
    const formData = new FormData();
    formData.append('message', message);
    
    if (file) {
      formData.append('file', file);
    }
    
    if (chatHistory && chatHistory.length > 0) {
      formData.append('chat_history', JSON.stringify(chatHistory));
    }
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error sending chat message:', error);
    throw error;
  }
};

// Get chat history
export const getChatHistory = async () => {
  try {
    const response = await fetch('/api/chat/history');
    
    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching chat history:', error);
    throw error;
  }
};

// Clear chat history
export const clearChatHistory = async () => {
  try {
    const response = await fetch('/api/chat/history', {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error clearing chat history:', error);
    throw error;
  }
};
