import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  onFileUpload: (file: File | null) => void;
  showLabel?: boolean;
}

export default function FileUpload({ onFileUpload, showLabel = false }: FileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  
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
  
  // Handle drag events
  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  
  // Handle drop event
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      // Check if the file is a CSV
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        alert('Please upload a CSV file.');
        return;
      }
      
      onFileUpload(file);
    }
  };

  // Compact version (used in chat input)
  if (!showLabel) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleTriggerFileUpload}
          title="Upload CSV"
          className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <i className="fas fa-file-csv"></i>
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
  
  // Full version with label (used in welcome screen)
  return (
    <div 
      className={`upload-area flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 transition-colors ${
        dragActive 
          ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" 
          : "border-gray-300 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700"
      }`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onClick={handleTriggerFileUpload}
    >
      <div className="w-16 h-16 mb-4 flex items-center justify-center rounded-full bg-primary-50 dark:bg-primary-900/20 text-primary-500">
        <i className="fas fa-file-csv text-3xl"></i>
      </div>
      <p className="text-lg font-medium mb-2">Upload your CSV file</p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">
        Drag and drop here or click to browse
      </p>
      <Button className="bg-primary-500 hover:bg-primary-600 text-white">
        Select CSV File
      </Button>
      <input 
        type="file" 
        ref={fileInputRef}
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
