

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./config/db');  // ← Import from db.js

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from 'public' folder
app.use(express.static(path.join(__dirname, 'public')));



// ---------- API ROUTES ----------

// 1. Contact form
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        await pool.query(
            'INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)',
            [name, email, subject, message]
        );
        res.json({ success: true, message: 'Message sent successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 2. IELTS Enrollment
app.post('/api/enroll-ielts', async (req, res) => {
    try {
        const { fullName, email, phone, desiredBand, classTiming } = req.body;
        await pool.query(
            'INSERT INTO ielts_enrollments (full_name, email, phone, desired_band, class_timing) VALUES (?, ?, ?, ?, ?)',
            [fullName, email, phone, desiredBand, classTiming]
        );
        res.json({ success: true, message: 'Enrollment successful' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});


// 3. Student Inquiries (Accommodation, Banking, Guardianship, Health, Money, SIM)
app.post('/api/student-inquiry', async (req, res) => {
    try {
        const { 
            firstName, lastName, email, phone, destination, 
            nearestOffice, termsAccepted, contactConsent, formType 
        } = req.body;
        
        await pool.query(
            `INSERT INTO student_inquiries 
            (first_name, last_name, email, phone, destination, nearest_office, 
             terms_accepted, contact_consent, form_type) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [firstName, lastName, email, phone, destination, nearestOffice, 
             termsAccepted, contactConsent, formType]
        );
        
        res.json({ success: true, message: 'Inquiry submitted successfully!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});


// ---------- SERVE HTML PAGES ----------
// Serve index.html from public folder
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve any other HTML file from public folder
app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    res.sendFile(path.join(__dirname, 'public', `${page}.html`));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));


// Admin Login API
// ========== ADMIN PANEL ROUTES ==========

// Admin Login API (MODIFIED VERSION - NO HASH)
app.post('/api/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = rows[0];
        
        // ✅ YAHAN CHANGE KIYA - Direct compare (hash hata diya)
        const isMatch = (password === user.password);
        
        if (!isMatch || !user.is_admin) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { id: user.id, email: user.email, isAdmin: true },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({ success: true, token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});
// Admin Middleware
const adminAuth = require('./middleware/adminAuth');

// Get all contacts
app.get('/api/admin/contacts', adminAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all IELTS enrollments
app.get('/api/admin/ielts', adminAuth, async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM ielts_enrollments ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get all student inquiries (with optional type filter)
app.get('/api/admin/inquiries', adminAuth, async (req, res) => {
    try {
        const { type } = req.query;
        let query = 'SELECT * FROM student_inquiries ORDER BY created_at DESC';
        let params = [];
        
        if (type && type !== 'all') {
            query = 'SELECT * FROM student_inquiries WHERE form_type = ? ORDER BY created_at DESC';
            params = [type];
        }
        
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// User Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, phone, country, password } = req.body;
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        const bcrypt = require('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.query(
            'INSERT INTO users (name, email, phone, preferred_country, password, is_admin) VALUES (?, ?, ?, ?, ?, 0)',
            [name, email, phone || null, country || null, hashedPassword]
        );
        const jwt = require('jsonwebtoken');
        const token = jwt.sign({ id: result.insertId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: result.insertId, name, email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// User Login
// User Login - Modified (Admin vs User redirect)


// User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = rows[0];
        
        // Password compare (plain text or hash)
        let isMatch;
        if (password === user.password) {
            isMatch = true;
        } else {
            const bcrypt = require('bcryptjs');
            isMatch = await bcrypt.compare(password, user.password);
        }
        
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { id: user.id, email: user.email, isAdmin: user.is_admin === 1 },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // ✅ YE IMPORTANT HAI - REDIRECT SET KARO
        let redirectUrl;
        if (user.is_admin === 1) {
            redirectUrl = '/admin/dashboard.html';
        } else {
            redirectUrl = '/index.html';
        }
        
        res.json({ 
            success: true, 
            token, 
            redirectUrl,
            user: { id: user.id, name: user.name, email: user.email, isAdmin: user.is_admin === 1 }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});


// Save a course
app.post('/api/user/save-course', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Login required' });
        
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { courseName } = req.body;
        
        const [rows] = await pool.query('SELECT saved_courses FROM users WHERE id = ?', [decoded.id]);
        let saved = rows[0].saved_courses ? JSON.parse(rows[0].saved_courses) : [];
        
        if (!saved.includes(courseName)) {
            saved.push(courseName);
            await pool.query('UPDATE users SET saved_courses = ? WHERE id = ?', [JSON.stringify(saved), decoded.id]);
        }
        res.json({ success: true, savedCourses: saved });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get saved courses
app.get('/api/user/saved-courses', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Login required' });
        
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const [rows] = await pool.query('SELECT saved_courses FROM users WHERE id = ?', [decoded.id]);
        const saved = rows[0].saved_courses ? JSON.parse(rows[0].saved_courses) : [];
        res.json({ savedCourses: saved });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Search courses
app.get('/api/courses/search', async (req, res) => {
    try {
        const { q, level, country } = req.query;
        let query = 'SELECT * FROM courses WHERE 1=1';
        let params = [];
        
        if (q) {
            query += ' AND (title LIKE ? OR description LIKE ? OR category LIKE ?)';
            params.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (level && level !== 'all') {
            query += ' AND level = ?';
            params.push(level);
        }
        if (country && country !== 'all') {
            query += ' AND country = ?';
            params.push(country);
        }
        
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});