import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Message } from "@/types";

interface MessageItemProps {
  message: Message;
}

export default function MessageItem({ message }: MessageItemProps) {
  const [isCopied, setIsCopied] = useState(false);
  
  // Handle copying message content
  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Apply animation classes for new messages
  const animationClass = "animate-fadeIn";

  if (message.isUser) {
    return (
      <div className={`message message-user ${animationClass}`}>
        <div className="flex items-start justify-end">
          <Card className="message-content mr-3 bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 rounded-lg p-4 shadow-sm max-w-3xl">
            <div className="message-text text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
              {message.content}
            </div>
          </Card>
          <Avatar className="message-avatar flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300">
            <i className="fas fa-user"></i>
          </Avatar>
        </div>
      </div>
    );
  }

  return (
    <div className={`message message-bot ${animationClass}`}>
      <div className="flex items-start">
        <Avatar className="message-avatar flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-700 dark:text-primary-300">
          <i className="fas fa-robot"></i>
        </Avatar>
        <Card className="message-content ml-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm max-w-3xl">
          <div className="message-text prose dark:prose-invert prose-sm sm:prose-base max-w-none">
            {message.content.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          <div className="message-actions mt-2 text-xs text-right">
            <Button variant="ghost" size="sm" onClick={handleCopy} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              <i className="fas fa-copy mr-1"></i>
              {isCopied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
