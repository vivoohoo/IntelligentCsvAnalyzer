import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Home from "@/pages/Home";
import NotFound from "@/pages/not-found";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect, createContext } from "react";

// Create context for theme
export const ThemeContext = createContext({
  isDarkMode: false,
  toggleDarkMode: () => {}
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { toast } = useToast();

  // API status check
  useEffect(() => {
    const checkApiStatus = async () => {
      try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        if (!data.backend_available) {
          toast({
            title: "Backend Service Unavailable",
            description: "The CSV analysis service is currently unavailable. Some features may be limited.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error("Error checking API status:", error);
      }
    };
    
    checkApiStatus();
    // Check API status every 30 seconds
    const intervalId = setInterval(checkApiStatus, 30000);
    
    return () => clearInterval(intervalId);
  }, [toast]);

  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
    if (!isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
        <div className={`${isDarkMode ? 'dark' : ''}`}>
          <Router />
          <Toaster />
        </div>
      </ThemeContext.Provider>
    </QueryClientProvider>
  );
}

export default App;
