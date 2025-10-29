require('dotenv').config(); // Load .env file

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();

// Database Connection Pool Setup
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware Setup
app.use(cors({
    origin: true, // 讓 CORS 動態設置 Access-Control-Allow-Origin 為發送請求的來源
    methods: ['GET', 'POST', 'PUT', 'DELETE'], 
    allowedHeaders: ['Content-Type', 'Authorization'], 
    credentials: true // 允許傳遞 Cookie 或認證資訊
}));
app.use(express.json());

// --- API Routes Implementation ---

// 1. 註冊使用者 (Register User)
app.post('/api/register', async (req, res) => {
    const { email, name } = req.body;
    if (!email || !name) {
        return res.status(400).send({ message: 'Email and name are required.' });
    }
    try {
        const [result] = await pool.execute(
            'INSERT INTO travellers (email, name) VALUES (?, ?)',
            [email, name]
        );
        res.status(201).send({ id: result.insertId, email, name, message: 'Registration successful.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
             // 當 Email 已經存在時，嘗試獲取該用戶的 ID (雖然前端邏輯可以處理，但後端給予更清晰的響應會更好)
             const [traveller] = await pool.execute('SELECT id, email, name FROM travellers WHERE email = ?', [email]);
             if (traveller.length > 0) {
                 return res.status(409).send({ 
                     message: 'Email already exists. Logged in successfully.',
                     id: traveller[0].id,
                     email: traveller[0].email,
                     name: traveller[0].name
                 });
             }
             return res.status(409).send({ message: 'Email already exists.' });
        }
        console.error(error);
        res.status(500).send({ message: 'Server error during registration.' });
    }
});

// 2. 建立行程 (Create Itinerary)
// **重要：這裡假設前端傳遞的是 traveller_email 而不是 traveller_id**
app.post('/api/itineraries', async (req, res) => {
    const { traveller_email, title, destination, start_date, end_date, short_description, detail_description } = req.body;

    if (!title || !destination || !start_date || !end_date || short_description.length > 80 || !traveller_email) {
        return res.status(400).send({ message: 'Missing required fields, invalid input, or short description too long. (Requires traveller_email and end_date)' });
    }

    try {
        // 1. 透過 Email 找到 traveller_id
        const [traveller] = await pool.execute('SELECT id FROM travellers WHERE email = ?', [traveller_email]);
        if (traveller.length === 0) {
            return res.status(404).send({ message: 'Traveller not found with this email.' });
        }
        const traveller_id = traveller[0].id;

        // 2. 使用 traveller_id 創建行程
        const [result] = await pool.execute(
            'INSERT INTO itineraries (traveller_id, title, destination, start_date, end_date, short_description, detail_description) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [traveller_id, title, destination, start_date, end_date, short_description, detail_description]
        );
        res.status(201).send({ id: result.insertId, message: 'Itinerary created successfully.' });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error during itinerary creation.' });
    }
});

// // 3. 獲取行程列表 (View Itinerary List) - 舊的路由，依賴 ID
// app.get('/api/itineraries/:travellerId', async (req, res) => {
//     const { travellerId } = req.params;

//     try {
//         const [rows] = await pool.execute(
//             'SELECT id, title, start_date, short_description FROM itineraries WHERE traveller_id = ? ORDER BY start_date DESC',
//             [travellerId]
//         );
//         res.send(rows);
//     } catch (error) {
//         console.error(error);
//         res.status(500).send({ message: 'Server error retrieving itineraries.' });
//     }
// });

// 3b. 獲取行程列表 (View Itinerary List) - **新的路由，依賴 Email**
app.get('/api/itineraries/by-email/:email', async (req, res) => {
    const { email } = req.params;

    try {
        // 1. 透過 Email 找到 traveller_id
        const [traveller] = await pool.execute('SELECT id FROM travellers WHERE email = ?', [email]);
        if (traveller.length === 0) {
            return res.status(404).send({ message: 'Traveller not found with this email.' });
        }
        const traveller_id = traveller[0].id;

        // 2. 獲取該 traveller_id 的所有行程
        const [rows] = await pool.execute(
            'SELECT id, title, start_date, end_date, short_description FROM itineraries WHERE traveller_id = ? ORDER BY start_date DESC',
            [traveller_id]
        );
        res.send(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error retrieving itineraries by email.' });
    }
});

// 4. 獲取單個行程的詳細資訊 (View Itinerary Detail)
app.get('/api/itineraries/detail/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await pool.execute(
            'SELECT * FROM itineraries WHERE id = ?',
            [id]
        );
        if (rows.length === 0) {
            return res.status(404).send({ message: 'Itinerary not found.' });
        }
        res.send(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error retrieving itinerary detail.' });
    }
});

// 5. 編輯行程 (Edit Itinerary)
app.put('/api/itineraries/:id', async (req, res) => {
    const { id } = req.params;
    const { title, destination, start_date, end_date, short_description, detail_description } = req.body;

    if (!title || !destination || !start_date || !end_date || short_description.length > 80) {
        return res.status(400).send({ message: 'Missing required fields, invalid input, or short description too long.' });
    }

    try {
        const [result] = await pool.execute(
            `UPDATE itineraries SET 
                title = ?, 
                destination = ?, 
                start_date = ?, 
                end_date = ?,
                short_description = ?, 
                detail_description = ? 
             WHERE id = ?`,
            [title, destination, start_date, end_date, short_description, detail_description, id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).send({ message: 'Itinerary not found or no changes made.' });
        }
        
        res.send({ message: `Itinerary ID ${id} updated successfully.` });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error during itinerary update.' });
    }
});

// 6. 刪除行程 (Delete Itinerary)
app.delete('/api/itineraries/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [result] = await pool.execute(
            'DELETE FROM itineraries WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).send({ message: 'Itinerary not found.' });
        }
        
        res.send({ message: `Itinerary ID ${id} deleted successfully.` });
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error during itinerary deletion.' });
    }
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // <-- 關鍵：監聽所有網路介面

app.listen(PORT, HOST, () => {
    console.log(`Backend running at http://${HOST}:${PORT}`);
});
