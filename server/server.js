const express = require('express');
const cors = require('cors');
const app = express( );
app.use(express.json( ));

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
// pdf-parse module optional loading handled later.

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_super_secret_key';

// File Upload Configuration
const uploadDocDir = path.join(__dirname, 'uploads', 'docs');
if (!fs.existsSync(uploadDocDir)) {
    fs.mkdirSync(uploadDocDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync(uploadDocDir)) fs.mkdirSync(uploadDocDir, { recursive: true });
        cb(null, uploadDocDir);
    },
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });


const PORT = process.env.PORT || 5000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database Setup
// Database Setup
const dbPath = path.resolve(__dirname, 'chatbot.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        // Create Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            reset_token TEXT,
            reset_token_expires DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (!err) {
                db.all("PRAGMA table_info(users)", (err, rows) => {
                    if (!err && !rows.some(r => r.name === 'reset_token')) {
                        console.log("Migrating database: Adding reset_token to users...");
                        db.run("ALTER TABLE users ADD COLUMN reset_token TEXT", () => {
                            db.run("ALTER TABLE users ADD COLUMN reset_token_expires DATETIME");
                        });
                    }
                });
            }
        });

        // Create Conversations Table
        db.run(`CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`, (err) => {
            if (!err) {
                // Migration logic for user_id
                db.all("PRAGMA table_info(conversations)", (err, rows) => {
                    if (!err && !rows.some(r => r.name === 'user_id')) {
                        console.log("Migrating database: Adding user_id to conversations...");
                        db.run("ALTER TABLE conversations ADD COLUMN user_id INTEGER");
                    }
                });
            }
        });

        // Create Messages Table
        db.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER,
            role TEXT CHECK(role IN ('user', 'ai')),
            content TEXT,
            image_data TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations (id)
        )`, (err) => {
            if (!err) {
                // Check if image_data column exists, if not add it (Migration for existing DB)
                db.all("PRAGMA table_info(messages)", (err, rows) => {
                    if (!err) {
                        const hasImageData = rows.some(r => r.name === 'image_data');
                        if (!hasImageData) {
                            console.log("Migrating database: Adding image_data column...");
                            db.run("ALTER TABLE messages ADD COLUMN image_data TEXT");
                        }
                    }
                });
            }
        });
    });
}

// AI Service Configuration
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

if (genAI) {
    console.log("Gemini API Key configuration found. AI responses will be generated via Gemini.");
} else {
    console.log("No Gemini API Key found. Using mock AI responses.");
}

const generateAIResponse = async (prompt, context = "") => {
    // 1. Try using Gemini API if Key is present
    if (genAI) {
        try {
            const systemInstruction = "You are a helpful AI assistant. Format your responses using Markdown. " +
                "Make some heading sizes big (using ## or ###), make important words **bold**, " +
                "and start important points with a dash (-), similar to ChatGPT's style. " +
                "Do not use normal text formatting; use markdown exclusively when making lists or emphasis.";

            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            let finalPrompt = systemInstruction + "\n\nUser Message: " + prompt;
            if (context) {
                finalPrompt += `\n\n[CONTEXT DATA EXTRACTED FROM ATTACHED FILE]:\n${context}\n\n[END CONTEXT DATA] Please answer the user's message considering this attached context.`;
            }
            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.error("Gemini API Error:", error.message);
            return "Currently experiencing issues with the AI service. Please try again later or check your API key.";
        }
    }

    // 2. Fallback to Smart Mock (if no key or error)
    return new Promise((resolve) => {
        setTimeout(() => {
            const mockResponses = [
                `You said: "${prompt}". That's interesting! (Mock AI)`,
                `I'm a mock AI, but I understood you asked about: "${prompt.substring(0, 20)}..."`,
                "I can't give a real answer without a Gemini API Key. Please add one to your .env file!",
                `Why do you ask "${prompt}"?`
            ];
            resolve(mockResponses[Math.floor(Math.random() * mockResponses.length)]);
        }, 1000);
    });
};

const generateImageResponse = async (prompt) => {
    try {
        const nvApiKey = process.env.NVIDIA_API_KEY;
        if (!nvApiKey) {
            throw new Error("NVIDIA_API_KEY is not configured.");
        }
        
        const modelUrl = "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl";
        
        const response = await fetch(modelUrl, {
            headers: {
                "Authorization": `Bearer ${nvApiKey}`,
                "Content-Type": "application/json",
            },
            method: "POST",
            body: JSON.stringify({
                text_prompts: [{ text: prompt, weight: 1 }],
                cfg_scale: 5,
                steps: 25,
                seed: 0,
                samples: 1
            }),
        });
        
        if (!response.ok) {
             const errorText = await response.text();
             throw new Error(`NVIDIA API returned status: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        if (!data.artifacts || data.artifacts.length === 0) {
            throw new Error("No image data returned from NVIDIA API.");
        }
        
        const base64Data = data.artifacts[0].base64;
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `image-${Date.now()}.jpg`;
        const filepath = path.join(__dirname, 'uploads', filename);
        fs.writeFileSync(filepath, buffer);
        
        return `http://localhost:${PORT}/uploads/${filename}`;
    } catch (error) {
        console.error("Image Generation Error:", error);
        throw new Error("Failed to generate image.");
    }
};

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (email, password) VALUES (?, ?)", [email, hashedPassword], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: err.message });
            }
            const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, user: { id: this.lastID, email } });
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: 'Invalid email or password' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid email or password' });

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.id, email: user.email } });
    });
});

app.post('/api/auth/forgot-password', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'User not found' });

        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenExpires = new Date(Date.now() + 3600000).toISOString(); // 1 hr

        db.run("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?", [resetToken, tokenExpires, user.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // SIMULATED EMAIL
            res.json({ message: 'Simulated email sent!', resetToken });
        });
    });
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });

    db.get("SELECT * FROM users WHERE reset_token = ?", [token], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: 'Invalid reset token' });

        const now = new Date().toISOString();
        if (user.reset_token_expires < now) {
            return res.status(400).json({ error: 'Reset token has expired' });
        }

        try {
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            db.run("UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?", [hashedPassword, user.id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Password has been successfully reset' });
            });
        } catch (hashErr) {
            res.status(500).json({ error: 'Error hashing password' });
        }
    });
});

// API Routes

// Get all conversations
app.get('/api/conversations', authenticateToken, (req, res) => {
    db.all("SELECT * FROM conversations WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC", [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Create new conversation
app.post('/api/conversations', authenticateToken, (req, res) => {
    const title = req.body.title || 'New Chat';
    db.run("INSERT INTO conversations (user_id, title) VALUES (?, ?)", [req.user.id, title], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, title });
    });
});

app.delete('/api/conversations/:id', authenticateToken, (req, res) => {
    const conversationId = req.params.id;
    // Verify ownership first
    db.get("SELECT user_id FROM conversations WHERE id = ?", [conversationId], (err, conv) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!conv || (conv.user_id && conv.user_id !== req.user.id)) return res.status(403).json({ error: 'Unauthorized' });

        // Delete messages first
        db.run("DELETE FROM messages WHERE conversation_id = ?", [conversationId], (err) => {
            if (err) return res.status(500).json({ error: err.message });

            db.run("DELETE FROM conversations WHERE id = ?", [conversationId], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ message: 'Conversation deleted', id: conversationId });
            });
        });
    });
});


// Get messages for a conversation
app.get('/api/conversations/:id/messages', authenticateToken, (req, res) => {
    const conversationId = req.params.id;
    db.all("SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC", [conversationId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Send message (User) and get response (AI)
app.post('/api/chat', authenticateToken, upload.single('file'), async (req, res) => {
    let { conversationId, content, isImageGenerator } = req.body;

    // Fix boolean from multipart form data
    if (isImageGenerator === 'true') isImageGenerator = true;
    if (isImageGenerator === 'false') isImageGenerator = false;

    if (!conversationId || !content) {
        return res.status(400).json({ error: 'Missing conversationId or content' });
    }

    // Process uploaded file
    let contextData = "";
    if (req.file) {
        try {
            const dataBuffer = fs.readFileSync(req.file.path);
            if (req.file.mimetype === 'application/pdf') {
                try {
                    const pdfParse = require('pdf-parse');
                    // Check if it's the newer class-based pdf-parse
                    if (pdfParse && pdfParse.PDFParse) {
                        const parser = new pdfParse.PDFParse(dataBuffer);
                        const result = await parser.parse();
                        contextData = result.text;
                    } else if (typeof pdfParse === 'function') {
                        // Standard older pdf-parse API
                        const pdfData = await pdfParse(dataBuffer);
                        contextData = pdfData.text;
                    } else {
                        contextData = "[PDF Parsing Error: Unsupported pdf-parse version.]";
                    }
                } catch (moduleErr) {
                    console.error("PDF module error:", moduleErr);
                    contextData = "[PDF Parsing Error: pdf-parse module not available or failed.]";
                }
            } else {
                contextData = dataBuffer.toString('utf8');
            }
        } catch (err) {
            console.error("Error parsing file:", err);
            return res.status(500).json({ error: 'Failed to process the uploaded file.' });
        }
    }

    // Auto-detect image generation request
    const lowerContent = content.toLowerCase().trim();
    if (lowerContent.startsWith('/image') ||
        lowerContent.startsWith('generate image') ||
        lowerContent.startsWith('generate an image') ||
        lowerContent.startsWith('create image') ||
        lowerContent.startsWith('create an image')) {
        isImageGenerator = true;
        // Strip the command prefix if it's /image
        if (lowerContent.startsWith('/image')) {
            content = content.replace(/^\/image\s*/i, '').trim() || "A random beautiful image";
        }
    }

    // 1. Save User Message
    db.run("INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)", [conversationId, 'user', content], async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        let aiResponseContent = "";
        let aiResponseImage = null;

        try {
            if (isImageGenerator) {
                // Generate Image
                const imageData = await generateImageResponse(content);
                if (imageData) {
                    aiResponseContent = "Here is the image you requested:";
                    aiResponseImage = imageData;
                } else {
                    aiResponseContent = "I tried to generate an image, but something went wrong (no data returned).";
                }
            } else {
                // Generate Text
                aiResponseContent = await generateAIResponse(content, contextData);
            }
        } catch (error) {
            console.error("Generation Error:", error);
            aiResponseContent = `Error generating response: ${error.message}`;
        }

        // 3. Save AI Message
        db.run("INSERT INTO messages (conversation_id, role, content, image_data) VALUES (?, ?, ?, ?)",
            [conversationId, 'ai', aiResponseContent, aiResponseImage],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });

                res.json({
                    userMessage: { role: 'user', content },
                    aiMessage: { role: 'ai', content: aiResponseContent, image_data: aiResponseImage }
                });
            });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
