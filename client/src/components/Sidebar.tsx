import { useContext } from "react";
import { Button } from "@/components/ui/button";
import { ThemeContext } from "@/App";
import { ChatSession } from "@/types";

interface SidebarProps {
  isOpen: boolean;
  chatHistory: ChatSession[];
  currentSessionId: string;
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onClearHistory: () => void;
}

export default function Sidebar({
  isOpen,
  chatHistory,
  currentSessionId,
  onNewChat,
  onSelectSession,
  onClearHistory
}: SidebarProps) {
  const { isDarkMode, toggleDarkMode } = useContext(ThemeContext);

  return (
    <div className={`sidebar ${isOpen ? 'w-64' : 'w-0'} md:w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden transition-all duration-300`}>
      {/* Logo and Title */}
      <div className="logo p-4 flex items-center space-x-2 border-b border-gray-200 dark:border-gray-700">
        <i className="fas fa-robot text-primary-500 text-2xl"></i>
        <span className="font-heading font-semibold text-xl">NxCompanion</span>
      </div>
      
      {/* New Chat Button */}
      <Button
        variant="outline"
        className="m-3 flex items-center justify-center space-x-2 bg-primary-50 hover:bg-primary-100 dark:bg-primary-900/20 dark:hover:bg-primary-900/30 text-primary-700 dark:text-primary-300"
        onClick={onNewChat}
      >
        <i className="fas fa-plus text-primary-600 dark:text-primary-400"></i>
        <span>New Chat</span>
      </Button>
      
      {/* Chat History */}
      <div className="history-container flex-1 overflow-y-auto px-3 py-2">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">Chat History</h3>
        <div className="space-y-1">
          {chatHistory.map((session) => (
            <div
              key={session.id}
              className={`chat-history-item p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-start ${
                session.id === currentSessionId ? 'bg-primary-50 dark:bg-primary-900/20' : ''
              }`}
              onClick={() => onSelectSession(session.id)}
            >
              <i className={`fas fa-comments ${
                session.id === currentSessionId 
                ? 'text-primary-400' 
                : 'text-gray-400 dark:text-gray-500'
              } mt-1 mr-2`}></i>
              <div className={`truncate text-sm ${
                session.id === currentSessionId 
                ? 'text-primary-700 dark:text-primary-300' 
                : 'text-gray-700 dark:text-gray-300'
              }`}>
                {session.title}
              </div>
            </div>
          ))}
          
          {chatHistory.length === 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400 p-2">
              No chat history yet
            </div>
          )}
        </div>
      </div>
      
      {/* Settings and Actions */}
      <div className="settings p-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
        {/* Dark Mode Toggle */}
        <button 
          className="theme-toggle w-full flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300"
          onClick={toggleDarkMode}
        >
          <span className="flex items-center">
            <i className={`${isDarkMode ? 'fas fa-sun' : 'fas fa-moon'} mr-2`}></i>
            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </span>
          <div className={`w-10 h-5 flex items-center ${isDarkMode ? 'bg-primary-600' : 'bg-gray-300'} rounded-full p-1 duration-300 ease-in-out`}>
            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${isDarkMode ? 'translate-x-5' : ''}`}></div>
          </div>
        </button>
        
        {/* Clear History Button */}
        <button 
          className="w-full flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300"
          onClick={onClearHistory}
        >
          <i className="fas fa-trash mr-2 text-gray-500 dark:text-gray-400"></i>
          <span>Clear History</span>
        </button>
        
        {/* Version Info */}
        <div className="pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 text-center">
          NxCompanion v1.2.0
        </div>
      </div>
    </div>
  );
}
