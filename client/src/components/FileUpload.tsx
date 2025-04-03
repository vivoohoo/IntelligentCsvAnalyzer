import { useRef } from "react";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  onFileUpload: (file: File | null) => void;
}

export default function FileUpload({ onFileUpload }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Trigger the file input click
  const handleTriggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    
    if (file) {
      // Check if the file is a CSV
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        alert('Please upload a CSV file.');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      
      onFileUpload(file);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleTriggerFileUpload}
        title="Upload CSV"
        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <i className="fas fa-paperclip"></i>
      </Button>
      <input 
        type="file" 
        ref={fileInputRef}
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
}
