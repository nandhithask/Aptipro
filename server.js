const express = require("express");
const mysql = require("mysql2/promise"); // Using promise-based version
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());
app.use(bodyParser.json());

// MySQL Database Connection
const db = mysql.createPool({
    host: "bspknp2miraf4yj8ufg5-mysql.services.clever-cloud.com",
    user: "uopdjrimuwnnyrbx",
    password: "CLoyJ2Gapy8pfjsvrMeM",
    database: "bspknp2miraf4yj8ufg5",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
connectTimeout: 60000 
});

// Test database connection
db.getConnection()
    .then(conn => {
        console.log("Connected to MySQL database");
        conn.release();
    })
    .catch(err => {
        console.error("Database connection failed:", err);
        process.exit(1);
    });

// In-memory store for test results
const testResultsStore = new Map();

// Signup Endpoint
app.post("/signup", async (req, res) => {
    try {
        const { email, username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            "INSERT INTO users (email, username, password) VALUES (?, ?, ?)",
            [email, username, hashedPassword]
        );
        res.status(201).json({ message: "User registered successfully!" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "Email or username already exists." });
        }
        console.error("Signup error:", err);
        res.status(500).json({ message: "An unexpected error occurred." });
    }
});

// Login Endpoint
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: "Username and Password are required" });
        }

        const [results] = await db.execute("SELECT * FROM users WHERE username = ?", [username]);
        if (results.length === 0) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        const user = results[0];
        const isPasswordMatch = await bcrypt.compare(password, user.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        res.status(200).json({ message: "Login successful", user });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// Get Questions Endpoint
// Updated Get Questions Endpoint
// Get Questions Endpoint
app.get('/api/questions', async (req, res) => {
    let connection;
    try {
        const count = parseInt(req.query.count) || 25; // Default to 25
        const topic = req.query.topic || 'profit';   // Default topic

        console.log(`Fetching ${count} questions on topic: ${topic}`);
        
        connection = await db.getConnection();
        
        // Get total questions count
        const [totalRows] = await connection.query(
            'SELECT COUNT(*) as total FROM quantitative_questions WHERE topic = ?',
            [topic]
        );
        const totalAvailable = totalRows[0].total;
        const actualCount = Math.min(count, totalAvailable);

        // Fetch questions
        const [questions] = await connection.query(
            `SELECT 
                id,
                question as text,
                option_a,
                option_b,
                option_c,
                option_d,
                correct_answer,
                explanation,
                topic
             FROM quantitative_questions WHERE topic = ?
             ORDER BY RAND()
             LIMIT ?`,
            [topic, actualCount]
        );

        if (!questions || questions.length === 0) {
            connection.release();
            return res.status(404).json({
                success: false,
                error: "No questions available for this topic"
            });
        }

        // Process questions
        const processedQuestions = questions.map(q => {
            const options = [
                q.option_a,
                q.option_b,
                q.option_c,
                q.option_d
            ].filter(opt => opt !== null && opt !== undefined);

            // Find correct answer index
            const correctIndex = options.findIndex(opt => opt === q.correct_answer);
            
            return {
                id: q.id,
                text: q.text,
                options: options,
                correctAnswer: correctIndex >= 0 ? correctIndex : 0,
                correct_answer: q.correct_answer, // original answer text
                explanation: q.explanation || 'No explanation available',
                topic: q.topic || 'Unknown', // Use actual topic from database
                difficulty: 'medium' // Default difficulty level
            };
        });

        connection.release();
        
        res.json({
            success: true,
            questions: processedQuestions,
            totalAvailable: totalAvailable,
            requested: count,
            returned: processedQuestions.length
        });

    } catch (err) {
        if (connection) connection.release();
        
        console.error("Endpoint error:", {
            message: err.message,
            stack: err.stack,
            sql: err.sql
        });
        
        res.status(500).json({
            success: false,
            error: "Failed to process request",
            details: process.env.NODE_ENV === 'development' ? {
                message: err.message,
                sql: err.sql
            } : undefined
        });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("Available endpoints:");
    console.log("- POST /signup");
    console.log("- POST /login");
    console.log("- GET /api/questions");
    console.log("- POST /api/submit-test");
    console.log("- GET /api/get-test-result/:resultId");
});