import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Plus, Send, Moon, Sun, Bot, User, Trash2, Square, Image as ImageIcon, LogOut, Paperclip, Mic, MicOff, Download } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import MessageBubble from './MessageBubble';
import Auth from './Auth';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [conversations, setConversations] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isImageMode, setIsImageMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [selectedFile, setSelectedFile] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Theme Effect
  useEffect(() => {
    document.body.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Fetch Conversations on Load
  useEffect(() => {
    fetchConversations();
  }, []);

  // Fetch Messages when Chat Changes
  useEffect(() => {
    if (currentChatId) {
      fetchMessages(currentChatId);
    } else {
      setMessages([]);
    }
  }, [currentChatId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setConversations([]);
    setMessages([]);
    setCurrentChatId(null);
  };

  const getAuthHeaders = () => {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchConversations = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/conversations`, { headers: getAuthHeaders() });
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        return;
      }
      const data = await res.json();
      setConversations(data);
      if (data.length > 0 && !currentChatId) {
        setCurrentChatId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  };

  const fetchMessages = async (chatId) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/conversations/${chatId}/messages`, { headers: getAuthHeaders() });
      const data = await res.json();
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const handleNewChat = async () => {
    try {
      const res = await fetch(`${API_URL}/conversations`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title: 'New Chat' })
      });
      const newChat = await res.json();
      setConversations([newChat, ...conversations]);
      setCurrentChatId(newChat.id);
    } catch (err) {
      console.error('Failed to create chat:', err);
    }
  };

  const handleDeleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this conversation?')) return;

    try {
      await fetch(`${API_URL}/conversations/${chatId}`, { method: 'DELETE', headers: getAuthHeaders() });
      setConversations(prev => prev.filter(c => c.id !== chatId));
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete chat:', err);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // If stopping while animating, force animation to end immediately
    if (isTyping) {
      setMessages(prev => {
        if (prev.length === 0) return prev;
        const lastMsg = prev[prev.length - 1];
        if (lastMsg.role === 'ai' && lastMsg.shouldAnimate) {
          return [...prev.slice(0, -1), { ...lastMsg, shouldAnimate: false }];
        }
        return prev;
      });
      setIsTyping(false);
    }
  };

  const handleTypingComplete = () => {
    setIsTyping(false);
    abortControllerRef.current = null;
  };

  const handleSendMessage = async () => {
    if (!input.trim() && !selectedFile) return;

    let chatId = currentChatId;

    if (!chatId) {
      try {
        const res = await fetch(`${API_URL}/conversations`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ title: input.substring(0, 30) || 'New Chat' })
        });

        if (!res.ok) throw new Error('Failed to create conversation');

        const newChat = await res.json();
        setConversations(prev => [newChat, ...prev]);
        setCurrentChatId(newChat.id);
        chatId = newChat.id;
      } catch (err) {
        console.error('Failed to create chat:', err);
        return;
      }
    }

    const userContent = input || "Attached file context.";
    setInput('');
    const fileToUpload = selectedFile;
    setSelectedFile(null); // Clear file attachment UI

    // Optimistic Update
    const tempUserMsg = { role: 'user', content: fileToUpload ? `[Attached File: ${fileToUpload.name}]\n${userContent}` : userContent };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsTyping(true);

    // Create new AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('conversationId', chatId);
      formData.append('content', userContent);
      formData.append('isImageGenerator', isImageMode);
      if (fileToUpload) {
        formData.append('file', fileToUpload);
      }

      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }, // Note: No Content-Type header so browser boundary sets automatically
        body: formData,
        signal: controller.signal
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Server error');
      }

      const aiMsg = { ...data.aiMessage, shouldAnimate: true };
      setMessages(prev => [...prev.slice(0, -1), data.userMessage, aiMsg]);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Generation stopped by user');
        return;
      }
      console.error('Failed to send message:', err);
      // Remove the optimistic message and show error
      setMessages(prev => [...prev.slice(0, -1), tempUserMsg, { role: 'ai', content: `Error: ${err.message || 'Could not connect to server.'}` }]);
      setIsTyping(false);
      abortControllerRef.current = null;
    } finally {
      // Do NOT set isTyping(false) here on success, wait for animation
      // But we DO clear the controller ref if successful request
      if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleListen = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Your browser does not support Speech Recognition.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  };

  const handleDownloadChat = () => {
    const element = document.getElementById('chat-history-export');
    if (!element) return;
    const opt = {
      margin:       0.5,
      filename:     'smartbot-chat.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
  };

  if (!token) {
    return <Auth setToken={setToken} />;
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <button className="new-chat-btn" onClick={handleNewChat}>
          <Plus size={16} /> New Chat
        </button>

        <div className="history-list">
          {conversations.map(chat => (
            <div
              key={chat.id}
              className={`history-item ${chat.id === currentChatId ? 'active' : ''}`}
              onClick={() => setCurrentChatId(chat.id)}
            >
              <MessageSquare size={16} />
              <span className="chat-title">{chat.title}</span>
              <button
                className="delete-chat-btn"
                onClick={(e) => handleDeleteChat(e, chat.id)}
                title="Delete conversation"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="theme-toggle" onClick={() => setIsDarkMode(!isDarkMode)}>
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
          {isDarkMode ? 'Light Mode' : 'Dark Mode'}
        </div>

        <div className="sidebar-action-btn" onClick={handleLogout} style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', cursor: 'pointer', borderRadius: '8px', color: 'var(--text-secondary)' }}>
          <LogOut size={16} />
          Logout
        </div>
      </div>

      {/* Chat Area */}
      <div className="chat-area">
        {currentChatId && (
          <div style={{
            padding: '20px 40px',
            borderBottom: '1px solid var(--sidebar-border)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 4
          }}>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
              {conversations.find(c => c.id === currentChatId)?.title || 'New Chat'}
            </h3>
            <button className="icon-btn export-btn" onClick={handleDownloadChat} title="Export to PDF" style={{background: 'rgba(99, 102, 241, 0.1)', color: 'var(--primary)', border: 'none', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500}}>
               <Download size={16} /> Export PDF
            </button>
          </div>
        )}

        <div className="messages-container" id="chat-history-export">
          {messages.length === 0 ? (
            <div className="empty-state">
              <Bot size={64} style={{ marginBottom: 20, color: 'var(--primary)' }} />
              <h2>How can I help you today?</h2>
              <p>Ask me anything about code, writing, or general knowledge.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <MessageBubble
                key={idx}
                message={msg}
                onTypingComplete={idx === messages.length - 1 ? handleTypingComplete : undefined}
              />
            ))
          )}
          {isTyping && (
            <div className="message ai">
              <div className="avatar ai"><Bot size={20} /></div>
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-container">
          <div className="input-box" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            {selectedFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(99, 102, 241, 0.1)', padding: '6px 12px', borderRadius: '6px', marginBottom: '8px', color: 'var(--primary)', fontSize: '0.9rem', width: 'fit-content' }}>
                <Paperclip size={14} />
                <span style={{maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{selectedFile.name}</span>
                <button onClick={() => setSelectedFile(null)} style={{background: 'none', border:'none', cursor:'pointer', color:'var(--primary)'}}>✕</button>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%' }}>
              <button 
                type="button" 
                onClick={() => document.getElementById('file-upload').click()}
                className="icon-btn" 
                title="Attach Document"
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px', marginRight: '4px' }}
              >
                <Paperclip size={20} />
              </button>
              <input 
                id="file-upload" 
                type="file" 
                accept=".pdf,.txt" 
                style={{ display: 'none' }} 
                onChange={(e) => setSelectedFile(e.target.files[0])}
              />
              <textarea
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${e.target.scrollHeight}px`;
                }}
                onKeyDown={handleKeyDown}
                placeholder={isImageMode ? "Describe an image to generate..." : "Send a message or attach a file..."}
                rows={1}
                style={{ maxHeight: '200px', overflowY: 'auto' }}
              />
              <button
                className={`image-mode-btn ${isImageMode ? 'active' : ''}`}
                onClick={() => setIsImageMode(!isImageMode)}
                title={isImageMode ? "Disable Image Mode" : "Enable Image Mode"}
              >
                <ImageIcon size={20} />
              </button>
              <button
                className={`image-mode-btn ${isListening ? 'active recording' : ''}`}
                onClick={handleListen}
                title={isListening ? "Stop listening" : "Voice typing"}
              >
                 {isListening ? <Mic size={20} color="#ef4444" /> : <Mic size={20} />}
              </button>
              <button
                className="send-btn"
                onClick={isTyping ? handleStop : handleSendMessage}
                disabled={(!input.trim() && !selectedFile) && !isTyping}
                title={isTyping ? "Stop generating" : "Send message"}
              >
                {isTyping ? <Square size={20} fill="currentColor" /> : <Send size={20} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
