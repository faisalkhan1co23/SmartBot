# SmartBot

A full-stack AI chatbot application with a React frontend and Node.js/Express backend.

## Getting Started

### Prerequisites

- Node.js installed on your machine.
- SQLite3 (optional, for inspecting the database manually).

### Installation

1.  **Install Client Dependencies:**
    ```bash
    cd client
    npm install
    ```

2.  **Install Server Dependencies:**
    ```bash
    cd server
    npm install
    ```

### Running the Application

**Recommended Method (Windows):**

Double-click the `start-project.bat` file in the root directory. This will open two terminal windows (one for the server, one for the client) and start the application.

**Manual Method:**

1.  Start the Server:
    ```bash
    cd server
    npm start
    ```
    Server runs on: `http://localhost:5000`

2.  Start the Client:
    ```bash
    cd client
    npm run dev
    ```
    Client runs on: `http://localhost:5173`

## Features

- Real-time chat interface.
- Conversation history stored in SQLite.
- Dark/Light mode toggle.
- Mock AI responses.
