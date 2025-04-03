// Global variables
let userInput, sendButton, newChatButton, clearHistoryButton, toggleThemeButton;
let exportChatButton, regenerateResponseButton, stopResponseButton, fileUploadButton, currentChatTitle;
let messagesContainer, chatHistoryContainer;
let currentChatId = null;
let isTyping = false;
let chatHistory = JSON.parse(localStorage.getItem("chatHistory")) || {};
let currentTheme = localStorage.getItem("theme") || "light";
let typingSpeed = 2; // reduced for faster letter-by-letter output
let letterTimeout = null; // separate timeout for letter typing
let pendingFile = null; // Store selected file until send
let stopGeneration = false; // Flag to stop the typing effect

const MODEL = "mistral-v1"; 
const API_KEY = "4mT6Z6P9Y4hEoY0wMKNfPbYDg7ojpbej";

// Initialize application when DOM is fully loaded
document.addEventListener("DOMContentLoaded", function() {
  console.log("✅ DOM Loaded Successfully!");

  // Assign elements to global variables
  userInput = document.getElementById("user-input");
  sendButton = document.getElementById("send-button");
  newChatButton = document.getElementById("new-chat");
  clearHistoryButton = document.getElementById("clear-history");
  toggleThemeButton = document.getElementById("toggle-theme");
  exportChatButton = document.getElementById("export-chat");
  regenerateResponseButton = document.getElementById("regenerate-response");
  stopResponseButton = document.getElementById("stop-response");
  fileUploadButton = document.getElementById("file-upload-button");
  fileUploadInput = document.getElementById("file-upload");
  currentChatTitle = document.getElementById("current-chat-title");
  messagesContainer = document.getElementById("messages");
  chatHistoryContainer = document.getElementById("chat-history"); 

  // Debug log - check if elements exist
  console.log("Checking Elements:", {
    userInput, sendButton, newChatButton, clearHistoryButton, toggleThemeButton,
    exportChatButton, regenerateResponseButton, stopResponseButton, fileUploadButton,
    currentChatTitle, messagesContainer, chatHistoryContainer
  });

  // Element existence validation
  if (!messagesContainer) console.error("❌ messagesContainer NOT FOUND! Check index.html.");
  if (!userInput) console.error("❌ userInput NOT FOUND in the DOM! Check index.html.");
  if (!sendButton) console.error("❌ sendButton NOT FOUND in the DOM!");
  if (!newChatButton) console.error("❌ newChatButton NOT FOUND in the DOM!");
  if (!currentChatTitle) console.error("❌ currentChatTitle NOT FOUND!");
  if (!chatHistoryContainer) console.error("❌ chatHistoryContainer NOT FOUND!");

  // Attach event listeners
  if (sendButton) sendButton.addEventListener("click", handleSendMessage);
  if (userInput) userInput.addEventListener("input", autoResizeTextarea);
  if (newChatButton) newChatButton.addEventListener("click", createNewChat);
  if (clearHistoryButton) clearHistoryButton.addEventListener("click", clearAllHistory);
  if (toggleThemeButton) toggleThemeButton.addEventListener("click", toggleTheme);
  if (exportChatButton) exportChatButton.addEventListener("click", exportCurrentChat);
  if (regenerateResponseButton) regenerateResponseButton.addEventListener("click", regenerateLastResponse);
  if (stopResponseButton) stopResponseButton.addEventListener("click", stopTypingEffect);
  if (fileUploadButton && fileUploadInput) fileUploadButton.addEventListener("click", () => fileUploadInput.click());
  
  // Initialize file upload listener
  if (fileUploadInput) {
    fileUploadInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) {
        pendingFile = file;
        displayPendingFilePreview(file);
      }
    });
  }

  // Apply current theme
  if (currentTheme === "dark") {
    document.body.classList.add("dark-mode");
    if (toggleThemeButton) {
      toggleThemeButton.innerHTML = '<i class="fas fa-sun"></i><span>Light Mode</span>';
    }
  }

  // Load chat history and initialize the UI
  updateChatHistorySidebar();

  // Create new chat if none exists
  if (Object.keys(chatHistory).length === 0) {
    createNewChat();
  } else {
    // Load most recent chat
    const mostRecentChatId = Object.keys(chatHistory).sort((a, b) => {
      return chatHistory[b].timestamp - chatHistory[a].timestamp;
    })[0];

    loadChat(mostRecentChatId);
  }

  // Global click listener to close any open options menus
  window.addEventListener("click", () => {
    document.querySelectorAll(".chat-options-menu").forEach((menu) => {
      menu.style.display = "none";
    });
  });

  console.log("✅ Event Listeners Attached!");
});

// Helper function to get stable rendering
function getStableRendering(text) {
  // Split text on triple backticks.
  let parts = text.split("```");
  if (parts.length % 2 === 1) {
    // All code blocks are closed.
    return marked.parse(text);
  } else {
    // Code block is open; force rendering as a code block by artificially closing it.
    let closedPart = parts.slice(0, parts.length - 1).join("```");
    let openPart = parts[parts.length - 1];
    return (
      marked.parse(closedPart) + marked.parse("```" + openPart + "\n```")
    );
  }
}

// Function to create a new chat
function createNewChat() {
  if (!messagesContainer) {
    console.error("❌ messagesContainer is missing in createNewChat!");
    return;
  }
  
  if (!currentChatTitle) {
    console.error("❌ currentChatTitle is missing!");
    return;
  }

  const chatId = "chat_" + Date.now();

  chatHistory[chatId] = {
    id: chatId,
    title: "New Conversation",
    timestamp: Date.now(),
    messages: []
  };

  currentChatId = chatId;
  currentChatTitle.textContent = "New Conversation";

  messagesContainer.innerHTML = `
    <div class="intro-message">
      <h1>Welcome to NxCompanion</h1>
      <p>Ask me anything.</p>
    </div>
  `;

  // Clear pending file and its preview when a new chat is created
  pendingFile = null;
  const previewContainer = document.getElementById("pending-file-preview");
  if (previewContainer) {
    previewContainer.innerHTML = "";
    previewContainer.style.display = "none";
  }

  saveChatHistory();
  updateChatHistorySidebar();
  
  console.log("🆕 New chat created!");
}

// Function to stop typing effect
function stopTypingEffect() {
  console.log("⏹️ Stopping AI Typing...");
  stopGeneration = true;
  clearTimeout(letterTimeout);
  if (stopResponseButton) stopResponseButton.style.display = "none";
  if (regenerateResponseButton) regenerateResponseButton.style.display = "inline-block";
  removeTypingIndicator();
}

// Function to handle send message
async function handleSendMessage() {
  if (isTyping) {
    alert("Please wait until the current response is completed.");
    return;
  }

  // Ensure userInput and fileUploadInput are properly defined
  const userInput = document.getElementById("user-input");  
  const fileUploadInput = document.getElementById("file-upload");  

  if (!userInput || !fileUploadInput) {
    console.error("❌ userInput or fileUploadInput NOT FOUND in the DOM!");
    return;
  }

  const message = userInput.value.trim();
  const file = fileUploadInput.files.length > 0 ? fileUploadInput.files[0] : null;

  // Only proceed if there is text or a file
  if (!message && !file) {
    console.error("❌ Please enter a message or upload a file.");
    return;
  }

  // Clear input and reset height
  userInput.value = "";
  userInput.style.height = "auto";
  fileUploadInput.value = ""; // Reset file input after sending

  // If there's text, add it as a user message
  if (message) {
    addMessageToUI("user", message);

    if (!chatHistory[currentChatId]) {
      createNewChat();
    }

    chatHistory[currentChatId].messages.push({
      role: "user",
      content: message
    });

    if (chatHistory[currentChatId].messages.length === 1) {
      const title = message.split(" ").slice(0, 4).join(" ") + 
        (message.split(" ").length > 4 ? "..." : "");
      chatHistory[currentChatId].title = title;
      currentChatTitle.textContent = title;
      updateChatHistorySidebar();
    }
  }

  // If a file was selected, process it now
  if (file) {
    addMessageToUI("user", `📂 Uploaded File: ${file.name}`);
  }

  saveChatHistory();

  try {
    showTypingIndicator();
    let response;

    if (file) {
      // Send request with file and prompt
      const formData = new FormData();
      formData.append("prompt", message || ""); // Send prompt even if empty
      formData.append("file", file);

      console.log("📤 Sending file to backend:", file.name);
      
      const res = await fetch("http://127.0.0.1:8000/api/upload/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      console.log("📥 Backend response:", data);
      
      response = data.response || "⚠️ No response received.";
      addMessageToUI("ai", response);
    } else {
      // Just text message - get AI response
      response = await getAIResponse(message);
      // UI gets updated during streaming in getAIResponse
    }

    // Save the chat history with the new message
    if (!file) { // Only push AI response if not already handled in getAIResponse
      chatHistory[currentChatId].messages.push({
        role: "assistant",
        content: response
      });
      saveChatHistory();
    }

  } catch (error) {
    console.error("❌ Error in handleSendMessage:", error);
    removeTypingIndicator();
    addMessageToUI("ai", `⚠️ Error: ${error.message}`);
  } finally {
    removeTypingIndicator();
  }
}

// Function to get AI response through backend API
async function getAIResponse(message) {
  isTyping = true;
  stopGeneration = false;
  
  if (regenerateResponseButton) regenerateResponseButton.style.display = "none";
  if (stopResponseButton) stopResponseButton.style.display = "inline-block";

  try {
    console.log("🔄 Sending message to API:", message);
    
    const response = await fetch("http://127.0.0.1:8000/api/upload/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: message,
        chat_history: chatHistory[currentChatId] ? chatHistory[currentChatId].messages : []
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log("📥 API Response:", data);

    if (!data.response) {
      throw new Error("No response received from API");
    }

    // Add AI response to the UI
    const aiResponse = data.response;
    addMessageToUI("ai", aiResponse);

    // Save to chat history
    chatHistory[currentChatId].messages.push({
      role: "assistant",
      content: aiResponse
    });
    saveChatHistory();

    return aiResponse;
  } catch (error) {
    console.error("❌ API Error:", error);
    throw error;
  } finally {
    isTyping = false;
    removeTypingIndicator();
    if (stopResponseButton) stopResponseButton.style.display = "none";
    if (regenerateResponseButton) regenerateResponseButton.style.display = "inline-block";
  }
}

// Display pending file preview
function displayPendingFilePreview(file) {
  const previewContainer = document.getElementById("pending-file-preview");

  if (!previewContainer) {
    console.warn("⚠️ Warning: pending-file-preview element is missing in index.html");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    let previewHTML = `<div class="file-preview">Uploading: ${file.name}</div>`;
    previewContainer.innerHTML = previewHTML;
    previewContainer.style.display = "block";
  };

  reader.readAsText(file);
}

// Function to add message to UI
function addMessageToUI(sender, content) {
  if (!messagesContainer) {
    console.error("❌ messagesContainer not found in addMessageToUI!");
    return;
  }

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}`;

  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  
  // For user messages, just set the text content
  if (sender === "user") {
    messageContent.textContent = content;
  } else {
    // For AI messages, render with markdown
    messageContent.innerHTML = marked.parse(content);
    
    // Find and enhance code blocks
    const codeBlocks = messageContent.querySelectorAll("pre code");
    codeBlocks.forEach(block => {
      // Create a copy button for code blocks
      const copyButton = document.createElement("button");
      copyButton.className = "code-copy-button";
      copyButton.innerHTML = '<i class="fas fa-copy"></i>';
      copyButton.title = "Copy code";
      
      copyButton.addEventListener("click", () => {
        navigator.clipboard.writeText(block.textContent).then(() => {
          copyButton.innerHTML = '<i class="fas fa-check"></i>';
          setTimeout(() => {
            copyButton.innerHTML = '<i class="fas fa-copy"></i>';
          }, 2000);
        });
      });
      
      // Add the copy button to the pre element
      const preElement = block.parentElement;
      preElement.style.position = "relative";
      preElement.appendChild(copyButton);
      
      // Apply syntax highlighting
      hljs.highlightElement(block);
    });
  }

  messageDiv.appendChild(messageContent);
  messagesContainer.appendChild(messageDiv);

  // Auto-scroll to bottom
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  console.log("✅ Message added to UI:", sender, content.substring(0, 50) + "...");
}

// Function to add file message to UI
function addFileMessageToUI(sender, htmlContent) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${sender}`;
  const messageContent = document.createElement("div");
  messageContent.className = "message-content";
  messageContent.innerHTML = htmlContent;
  messageDiv.appendChild(messageContent);
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to show typing indicator
function showTypingIndicator() {
  const typingDiv = document.createElement("div");
  typingDiv.className = "typing-indicator";
  typingDiv.id = "typing-indicator";

  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("div");
    dot.className = "typing-dot";
    typingDiv.appendChild(dot);
  }

  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Function to remove typing indicator
function removeTypingIndicator() {
  const typingIndicator = document.getElementById("typing-indicator");
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

// Function to load a chat
function loadChat(chatId) {
  if (!chatHistory[chatId]) return;

  currentChatId = chatId;
  currentChatTitle.textContent = chatHistory[chatId].title;

  messagesContainer.innerHTML = "";

  chatHistory[chatId].messages.forEach((message) => {
    // If the user message has a file property, render using innerHTML
    if (message.role === "user") {
      if (message.file) {
        addFileMessageToUI("user", message.content);
      } else {
        addMessageToUI("user", message.content);
      }
    } else {
      addMessageToUI("ai", message.content);
    }
  });

  updateActiveChatInSidebar();
}

// Function to save chat history to localStorage
function saveChatHistory() {
  localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
  updateChatHistorySidebar();
}

// Function to update chat history sidebar
function updateChatHistorySidebar() {
  if (!chatHistoryContainer) {
    console.error("❌ chatHistoryContainer is missing in updateChatHistorySidebar!");
    return;
  }

  chatHistoryContainer.innerHTML = ""; // Clear old chat history
  
  // Sort chats by timestamp, newest first
  const sortedChatIds = Object.keys(chatHistory).sort((a, b) => {
    return chatHistory[b].timestamp - chatHistory[a].timestamp;
  });
  
  sortedChatIds.forEach((chatId) => {
    const chat = chatHistory[chatId];
    const chatItem = document.createElement("div");
    chatItem.className = `chat-history-item ${
      chatId === currentChatId ? "active" : ""
    }`;
    chatItem.dataset.chatId = chatId;

    // Create icon element
    const icon = document.createElement("i");
    icon.className = "fas fa-comment";
    // Create span for chat title using textContent for safety
    const titleSpan = document.createElement("span");
    titleSpan.textContent = chat.title;

    chatItem.appendChild(icon);
    chatItem.appendChild(titleSpan);

    // When clicking the chat item (outside the options button) load the chat
    chatItem.addEventListener("click", () => {
      loadChat(chatId);
    });

    // Create the options button (three dots)
    const optionsButton = document.createElement("button");
    optionsButton.className = "chat-options-button";
    optionsButton.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
    // Stop propagation so clicking this does not trigger the parent click event
    optionsButton.addEventListener("click", (e) => {
      e.stopPropagation();
      // Toggle the options menu
      optionsMenu.style.display =
        optionsMenu.style.display === "none" ? "block" : "none";
    });

    // Create the options menu (hidden by default)
    const optionsMenu = document.createElement("div");
    optionsMenu.className = "chat-options-menu";
    optionsMenu.style.display = "none";
    optionsMenu.innerHTML = `
      <div class="chat-options-item delete-chat">Delete</div>
      <div class="chat-options-item rename-chat">Rename</div>
    `;

    // Handle deletion of a chat
    optionsMenu
      .querySelector(".delete-chat")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this chat?")) {
          delete chatHistory[chatId];
          if (currentChatId === chatId) {
            createNewChat();
          }
          saveChatHistory();
          updateChatHistorySidebar();
        }
      });

    // Handle renaming a chat
    optionsMenu
      .querySelector(".rename-chat")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        const newName = prompt("Enter new name for this chat:", chat.title);
        if (newName) {
          chat.title = newName;
          saveChatHistory();
          updateChatHistorySidebar();
          if (currentChatId === chatId) {
            currentChatTitle.textContent = newName;
          }
        }
      });

    // Append the options button and menu to the chat item
    chatItem.appendChild(optionsButton);
    chatItem.appendChild(optionsMenu);

    // Append the chat item to the history container
    chatHistoryContainer.appendChild(chatItem);
  });
  
  console.log("🔄 Chat history sidebar updated!");
}

// Function to update active chat in sidebar
function updateActiveChatInSidebar() {
  document.querySelectorAll(".chat-history-item").forEach((item) => {
    item.classList.remove("active");
    if (item.dataset.chatId === currentChatId) {
      item.classList.add("active");
    }
  });
}

// Function to clear all chat history
function clearAllHistory() {
  if (
    confirm(
      "Are you sure you want to clear all chat history? This cannot be undone."
    )
  ) {
    chatHistory = {};
    localStorage.removeItem("chatHistory");
    createNewChat();
  }
}

// Function to toggle theme
function toggleTheme() {
  if (currentTheme === "light") {
    document.body.classList.add("dark-mode");
    currentTheme = "dark";
    toggleThemeButton.innerHTML =
      '<i class="fas fa-sun"></i><span>Light Mode</span>';
  } else {
    document.body.classList.remove("dark-mode");
    currentTheme = "light";
    toggleThemeButton.innerHTML =
      '<i class="fas fa-moon"></i><span>Dark Mode</span>';
  }

  localStorage.setItem("theme", currentTheme);
}

// Function to export current chat
function exportCurrentChat() {
  if (!chatHistory[currentChatId]) return;

  const chat = chatHistory[currentChatId];
  let exportText = `# ${chat.title}\n\n`;

  chat.messages.forEach((message) => {
    const role = message.role === "user" ? "You" : "NxCompanion AI";
    exportText += `## ${role}:\n${message.content}\n\n`;
  });

  const blob = new Blob([exportText], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${chat.title.replace(/[^\w\s]/gi, "")}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Function to regenerate the last AI response
function regenerateLastResponse() {
  if (
    chatHistory[currentChatId] &&
    chatHistory[currentChatId].messages.length > 0
  ) {
    // Find the last message by the assistant
    let lastAssistantIndex = -1;
    for (let i = chatHistory[currentChatId].messages.length - 1; i >= 0; i--) {
      if (chatHistory[currentChatId].messages[i].role === "assistant") {
        lastAssistantIndex = i;
        break;
      }
    }
    
    if (lastAssistantIndex >= 0) {
      // Remove the last assistant message
      chatHistory[currentChatId].messages.splice(lastAssistantIndex, 1);
      
      // Remove the corresponding message element from the UI
      const messageElements = document.querySelectorAll(".message.ai");
      if (messageElements.length > 0) {
        messageElements[messageElements.length - 1].remove();
      }
      
      saveChatHistory();
      
      // Get the last user message to regenerate a response for
      let lastUserMessage = "";
      for (let i = chatHistory[currentChatId].messages.length - 1; i >= 0; i--) {
        if (chatHistory[currentChatId].messages[i].role === "user") {
          lastUserMessage = chatHistory[currentChatId].messages[i].content;
          break;
        }
      }
      
      if (lastUserMessage) {
        showTypingIndicator();
        getAIResponse(lastUserMessage)
          .then((response) => {
            console.log("✅ Regenerated response");
          })
          .catch((error) => {
            removeTypingIndicator();
            addMessageToUI(
              "ai",
              `⚠️ Error generating response: ${error.message}`
            );
          });
      }
    }
  }
}

// Function to auto-resize textarea
function autoResizeTextarea() {
  const userInput = document.getElementById("user-input");
  if (userInput) {
    userInput.style.height = "auto"; 
    userInput.style.height = userInput.scrollHeight + "px"; 
  } else {
    console.error("❌ Element #user-input not found!");
  }
}

// Helper to escape HTML (for text files)
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  };
  return text.replace(/[&<>"']/g, function (m) {
    return map[m];
  });
}