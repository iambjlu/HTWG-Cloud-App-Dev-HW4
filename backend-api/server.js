// index.js
require('dotenv').config(); // Load .env file

const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const express = require('express');
const mysql = require('mysql2/promise');
const app = express();

// Middleware Setup
const cors = require('cors');
// app.use(cors({
//     origin: ['https://你的正式網域.com'],
// }));
app.use(cors());
app.use(express.json());


// 解析 service account JSON 從 env
let storage;
if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    const creds = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
    storage = new Storage({
        projectId: creds.project_id,
        credentials: {
            client_email: creds.client_email,
            private_key: creds.private_key
        }
    });
} else {
    // fallback: default GOOGLE_APPLICATION_CREDENTIALS path logic
    storage = new Storage();
}

const BUCKET_NAME = process.env.GCP_BUCKET_NAME || 'htwg-cloudapp-hw.firebasestorage.app';

const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/upload-avatar', upload.single('avatar'), async (req, res) => {
    try {
        const email = req.body.email;
        const file = req.file;

        if (!email) {
            return res.status(400).send({ message: 'Missing email.' });
        }
        if (!file) {
            return res.status(400).send({ message: 'Missing avatar file.' });
        }

        if (file.mimetype !== 'image/jpeg' && file.mimetype !== 'image/jpg') {
            return res.status(400).send({ message: 'Only JPEG allowed.' });
        }

        const destFileName = `avatar/${email}.jpg`;

        const bucket = storage.bucket(BUCKET_NAME);
        const gcFile = bucket.file(destFileName);

        await gcFile.save(file.buffer, {
            metadata: {
                contentType: 'image/jpeg',
                cacheControl: 'public, max-age=3600'
            },
            resumable: false
        });

        await gcFile.makePublic().catch(() => {});

        return res.status(200).send({ message: 'Avatar uploaded.' });
    } catch (err) {
        console.error('Upload avatar error:', err);
        return res.status(500).send({ message: 'Failed to upload avatar.' });
    }
});


// 小工具：把日期物件或字串轉成 "YYYY-MM-DD"
// function formatDate(date) {
//     if (!date) return null;
//     return new Date(date).toISOString().split('T')[0];
// }
function formatDate(date) {
    if (!date) return null;

    const d = new Date(date);
    d.setDate(d.getDate());

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}/${month}/${day}`; // yyyy/MM/dd 格式
}


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
app.post('/api/itineraries', async (req, res) => {
    const { traveller_email, title, destination, start_date, end_date, short_description, detail_description } = req.body;

    if (!title || !destination || !start_date || !end_date || short_description.length > 80 || !traveller_email) {
        return res.status(400).send({ message: 'Missing required fields, invalid input, or short description too long. (Requires traveller_email and end_date)' });
    }

    try {
        const [traveller] = await pool.execute('SELECT id FROM travellers WHERE email = ?', [traveller_email]);
        if (traveller.length === 0) {
            return res.status(404).send({ message: 'Traveller not found with this email.' });
        }
        const traveller_id = traveller[0].id;

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

// 3b. 獲取行程列表 (View Itinerary List) - 依賴 Email
app.get('/api/itineraries/by-email/:email', async (req, res) => {
    const { email } = req.params;

    try {
        const [rows] = await pool.execute(`
            SELECT i.id, i.title, i.start_date, i.end_date, i.short_description, t.email AS traveller_email
            FROM itineraries i
            JOIN travellers t ON i.traveller_id = t.id
            ORDER BY i.start_date DESC
        `, [email]);

        const formattedRows = rows.map(row => ({
            ...row,
            start_date: formatDate(row.start_date),
            end_date: formatDate(row.end_date)
        }));

        res.send(formattedRows);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error retrieving itineraries by email.' });
    }
});

// 4. 獲取單個行程的詳細資訊 (View Itinerary Detail)
app.get('/api/itineraries/detail/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [rows] = await pool.execute(`
            SELECT i.*, t.email AS traveller_email
            FROM itineraries i
            JOIN travellers t ON i.traveller_id = t.id
            WHERE i.id = ?
        `, [id]);

        if (rows.length === 0) {
            return res.status(404).send({ message: 'Itinerary not found.' });
        }

        const itinerary = rows[0];
        itinerary.start_date = formatDate(itinerary.start_date);
        itinerary.end_date = formatDate(itinerary.end_date);

        res.send(itinerary);
    } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Server error retrieving itinerary detail.' });
    }
});

// 5. 編輯行程 (Edit Itinerary)
app.put('/api/itineraries/:id', async (req, res) => {
    const { id } = req.params;
    const { title, destination, start_date, end_date, short_description, detail_description, traveller_email } = req.body;

    if (!title || !destination || !start_date || !end_date || short_description.length > 80 || !traveller_email) {
        return res.status(400).send({ message: 'Missing required fields or traveller_email.' });
    }

    try {
        // 驗證該行程是否屬於該 email
        const [rows] = await pool.execute(`
            SELECT i.id
            FROM itineraries i
                     JOIN travellers t ON i.traveller_id = t.id
            WHERE i.id = ? AND t.email = ?
        `, [id, traveller_email]);

        if (rows.length === 0) {
            return res.status(403).send({ message: 'You are not the owner of this itinerary.' });
        }

        const [result] = await pool.execute(
            `UPDATE itineraries SET 
                title = ?, destination = ?, start_date = ?, end_date = ?,
                short_description = ?, detail_description = ?
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
    const { traveller_email } = req.body;

    if (!traveller_email) {
        return res.status(400).send({ message: 'Missing traveller_email for authorization.' });
    }

    try {
        // 驗證擁有者
        const [rows] = await pool.execute(`
            SELECT i.id
            FROM itineraries i
            JOIN travellers t ON i.traveller_id = t.id
            WHERE i.id = ? AND t.email = ?
        `, [id, traveller_email]);

        if (rows.length === 0) {
            return res.status(403).send({ message: 'You are not authorized to delete this itinerary.' });
        }

        const [result] = await pool.execute('DELETE FROM itineraries WHERE id = ?', [id]);
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
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
    console.log(`Backend running at http://${HOST}:${PORT}`);
});