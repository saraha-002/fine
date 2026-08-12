// ─── Fetch polyfill for older Node versions ──────────────────────
if (!global.fetch) {
    const fetch = require('node-fetch');
    global.fetch = fetch;
} 

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt'); // ✅ ADDED: For password hashing

// ─── Load Environment Variables ──────────────────────────────────
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('.'));

// ─── Render Helper ──────────────────────────────────────────────────
function render(template, context) {
    let result = template;
    for (const [key, value] of Object.entries(context)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value !== undefined ? value : '');
    }
    return result;
}

// ─── MongoDB Connection ──────────────────────────────────────────
const MONGO_URL = process.env.MONGO_URL;
let db = null;
let client = null;

async function connectDB() {
    try {
        if (!MONGO_URL) {
            console.error('❌ MONGO_URL environment variable is not set!');
            console.log('📁 Falling back to file-based storage...');
            return false;
        }
        
        client = new MongoClient(MONGO_URL);
        await client.connect();
        db = client.db('fineescorts');
        console.log('✅ Connected to MongoDB Atlas successfully!');
        
        // Create collections if they don't exist
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        if (!collectionNames.includes('users')) {
            await db.createCollection('users');
            console.log('📁 Created "users" collection');
        }
        if (!collectionNames.includes('profiles')) {
            await db.createCollection('profiles');
            console.log('📁 Created "profiles" collection');
        }
        if (!collectionNames.includes('subscriptions')) {
            await db.createCollection('subscriptions');
            console.log('📁 Created "subscriptions" collection');
        }
        if (!collectionNames.includes('reviews')) {
            await db.createCollection('reviews');
            console.log('📁 Created "reviews" collection');
        }
        
        // ─── MIGRATION: Seed existing profiles from JSON ──────────
        await migrateProfiles();
        
        return true;
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        console.log('📁 Falling back to file-based storage...');
        return false;
    }
}

// ─── Migration: Seed profiles from profiles.json ──────────────────
async function migrateProfiles() {
    try {
        const profilesCollection = db.collection('profiles');
        const count = await profilesCollection.countDocuments();
        
        if (count === 0) {
            console.log('📁 Seeding profiles from profiles.json...');
            const jsonPath = path.join(__dirname, 'data', 'profiles.json');
            if (fs.existsSync(jsonPath)) {
                const profiles = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                if (profiles.length > 0) {
                    const result = await profilesCollection.insertMany(profiles);
                    console.log(`✅ Seeded ${result.insertedCount} profiles from profiles.json`);
                }
            } else {
                console.warn('⚠️ profiles.json not found, skipping seed');
            }
        } else {
            console.log(`✅ Already have ${count} profiles in database`);
        }
    } catch (err) {
        console.error('⚠️ Migration error:', err.message);
    }
}

// ─── reCAPTCHA Verification ────────────────────────────────────────
async function verifyRecaptcha(token) {
    if (!token) return false;
    try {
        // ✅ Use the NEW secret key
        const secret = process.env.RECAPTCHA_SECRET_KEY || '6LcKDGEtAAAAAIcEmbFQqPmxoOLrK51_AdD2dqen';
        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${secret}&response=${token}`
        });
        const data = await response.json();
        console.log('🔍 reCAPTCHA full response:', JSON.stringify(data, null, 2));
        
        if (data.success === true) {
            console.log('✅ reCAPTCHA verification PASSED');
        } else {
            console.log('❌ reCAPTCHA verification FAILED:', data['error-codes'] || 'No error codes');
        }
        return data.success === true;
    } catch (error) {
        console.error('reCAPTCHA error:', error);
        return false;
    }
}

// ─── Database Helpers ─────────────────────────────────────────────
function getCollection(name) {
    if (db) {
        return db.collection(name);
    }
    // Fallback to file-based storage
    return null;
}

// ─── File-Based Fallback ──────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, defaultVal = []) {
    try {
        const filePath = path.join(DATA_DIR, file);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        return defaultVal;
    } catch (e) {
        console.warn(`⚠️ Error reading ${file}:`, e.message);
        return defaultVal;
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`❌ Error writing ${file}:`, e.message);
    }
}

// ─── Helper Functions ─────────────────────────────────────────────
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// ⬇️⬇️⬇️ ADD THE RENDER FUNCTION HERE ⬇️⬇️⬇️

function render(template, context) {
    let result = template;
    for (const [key, value] of Object.entries(context)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value !== undefined ? value : '');
    }
    return result;
}

async function findUserByEmail(email) {
    const usersCol = getCollection('users');
    if (usersCol) {
        return await usersCol.findOne({ email });
    }
    // File-based fallback
    const users = readJSON('users.json', {});
    for (const [id, user] of Object.entries(users)) {
        if (user.email === email) return { id, ...user };
    }
    return null;
}

async function findUserById(id) {
    const usersCol = getCollection('users');
    if (usersCol) {
        return await usersCol.findOne({ _id: new ObjectId(id) });
    }
    const users = readJSON('users.json', {});
    return users[id] ? { id, ...users[id] } : null;
}

async function findProfileByUserId(userId) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        return await profilesCol.findOne({ userId });
    }
    const profiles = readJSON('profiles.json', []);
    return profiles.find(p => p.userId === userId);
}

async function findProfileBySlug(slug) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        return await profilesCol.findOne({ slug });
    }
    const profiles = readJSON('profiles.json', []);
    return profiles.find(p => p.slug === slug);
}

async function getAllProfiles() {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        return await profilesCol.find({}).toArray();
    }
    return readJSON('profiles.json', []);
}

async function saveProfile(profile) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        const result = await profilesCol.insertOne(profile);
        return { ...profile, _id: result.insertedId };
    }
    const profiles = readJSON('profiles.json', []);
    profiles.push(profile);
    writeJSON('profiles.json', profiles);
    return profile;
}

async function updateProfile(slug, updates) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        await profilesCol.updateOne({ slug }, { $set: updates });
        return await profilesCol.findOne({ slug });
    }
    const profiles = readJSON('profiles.json', []);
    const index = profiles.findIndex(p => p.slug === slug);
    if (index !== -1) {
        profiles[index] = { ...profiles[index], ...updates };
        writeJSON('profiles.json', profiles);
        return profiles[index];
    }
    return null;
}

// ─── Auth Middleware ──────────────────────────────────────────────
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    
    const usersCol = getCollection('users');
    if (usersCol) {
        const user = await usersCol.findOne({ token });
        if (!user) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        req.userId = user._id.toString();
        req.user = user;
        return next();
    }
    
    // File-based fallback
    const users = readJSON('users.json', {});
    for (const [id, user] of Object.entries(users)) {
        if (user.token === token) {
            req.userId = id;
            req.user = { id, ...user };
            return next();
        }
    }
    return res.status(401).json({ message: 'Invalid token' });
}

// ─── Routes ────────────────────────────────────────────────────────

// ─── Auth Routes ──────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
    }
    
    const existing = await findUserByEmail(email);
    if (existing) {
        return res.status(409).json({ message: 'Email already registered' });
    }
    
    const userId = new ObjectId().toString();
    const token = generateToken();
    
    // ✅ Hash the password before storing
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = {
        _id: new ObjectId(userId),
        email,
        password: hashedPassword, // ✅ Stored securely
        token,
        role: 'escort',
        createdAt: new Date().toISOString()
    };
    
    const usersCol = getCollection('users');
    if (usersCol) {
        await usersCol.insertOne(newUser);
    } else {
        const users = readJSON('users.json', {});
        users[userId] = newUser;
        writeJSON('users.json', users);
    }
    
    res.status(201).json({
        message: 'Registration successful',
        token,
        userId,
        user: { email, role: 'escort' }
    });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
    }
    
    const user = await findUserByEmail(email);
    if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // ✅ Compare hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    const token = generateToken();
    const usersCol = getCollection('users');
    if (usersCol) {
        await usersCol.updateOne({ _id: user._id }, { $set: { token } });
    } else {
        const users = readJSON('users.json', {});
        if (users[user.id]) {
            users[user.id].token = token;
            writeJSON('users.json', users);
        }
    }
    
    const profile = await findProfileByUserId(user._id?.toString() || user.id);
    const subStatus = profile ? { active: false } : { active: false };
    
    res.json({
        message: 'Login successful',
        token,
        user: { email: user.email, role: user.role || 'escort' },
        subscription: subStatus
    });
});

// ─── Profile Routes ──────────────────────────────────────────────
app.get('/api/profiles/me', authenticate, async (req, res) => {
    const profile = await findProfileByUserId(req.userId);
    if (!profile) {
        return res.status(404).json({ message: 'Profile not found' });
    }
    res.json(profile);
});

app.post('/api/profiles', authenticate, async (req, res) => {
    const { displayName, age, location, ethnicity, description, services, phone } = req.body;
    if (!displayName || !age || !location || !description || !phone) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    
    const existing = await findProfileByUserId(req.userId);
    if (existing) {
        return res.status(409).json({ message: 'You already have a profile' });
    }
    
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString().slice(-4);
    const newProfile = {
        slug,
        userId: req.userId,
        name: displayName,
        displayName,
        age: parseInt(age),
        city: location,
        location,
        ethnicity: ethnicity || '',
        description,
        services: services || [],
        phone,
        fullNumber: phone,
        photos: [],
        images: [],
        status: 'pending',
        isApproved: false,
        createdAt: new Date().toISOString(),
        profileViews: 0,
        verified: false
    };
    
    const saved = await saveProfile(newProfile);
    res.status(201).json({
        message: 'Profile created successfully. Awaiting admin approval.',
        profile: saved
    });
});

// ─── UPDATE PROFILE ──────────────────────────────────────────────
app.put('/api/profiles/me', authenticate, async (req, res) => {
    try {
        const { displayName, age, location, ethnicity, description, services, phone, photos } = req.body;
        
        // Find the profile
        const profile = await findProfileByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        
        // Build update object
        const updates = {};
        if (displayName !== undefined) updates.displayName = displayName;
        if (age !== undefined) updates.age = parseInt(age);
        if (location !== undefined) updates.location = location;
        if (ethnicity !== undefined) updates.ethnicity = ethnicity;
        if (description !== undefined) updates.description = description;
        if (services !== undefined) updates.services = services;
        if (phone !== undefined) updates.phone = phone;
        if (photos !== undefined) updates.photos = photos;
        
        // Update the profile
        const updated = await updateProfile(profile.slug, updates);
        
        res.json({
            message: '✅ Profile updated successfully',
            profile: updated
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ 
            message: 'Failed to update profile',
            error: error.message 
        });
    }
});

// ─── Admin Routes ──────────────────────────────────────────────────
app.get('/api/admin/stats', authenticate, async (req, res) => {
    const user = await findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const profiles = await getAllProfiles();
    const pending = profiles.filter(p => p.status === 'pending' || !p.isApproved).length;
    const approved = profiles.filter(p => p.status === 'approved' || p.isApproved).length;
    const rejected = profiles.filter(p => p.status === 'rejected').length;
    res.json({ pending, approved, rejected, total: profiles.length });
});

app.get('/api/admin/profiles', authenticate, async (req, res) => {
    const user = await findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { status } = req.query;
    let profiles = await getAllProfiles();
    if (status === 'pending') {
        profiles = profiles.filter(p => p.status === 'pending' || !p.isApproved);
    } else if (status === 'approved') {
        profiles = profiles.filter(p => p.status === 'approved' || p.isApproved);
    } else if (status === 'rejected') {
        profiles = profiles.filter(p => p.status === 'rejected');
    }
    res.json(profiles);
});

app.put('/api/admin/profiles/:slug/approve', authenticate, async (req, res) => {
    const user = await findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const slug = req.params.slug;
    const updated = await updateProfile(slug, { isApproved: true, status: 'approved', approvedAt: new Date().toISOString() });
    if (!updated) {
        return res.status(404).json({ message: 'Profile not found' });
    }
    res.json({ message: '✅ Profile approved successfully', profile: updated });
});

app.delete('/api/admin/profiles/:slug', authenticate, async (req, res) => {
    const user = await findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const slug = req.params.slug;
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        const result = await profilesCol.deleteOne({ slug });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Profile not found' });
        }
    } else {
        const profiles = readJSON('profiles.json', []);
        const index = profiles.findIndex(p => p.slug === slug);
        if (index === -1) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        profiles.splice(index, 1);
        writeJSON('profiles.json', profiles);
    }
    res.json({ message: '❌ Profile rejected and deleted successfully' });
});
// ─── GET ALL APPROVED PROFILES (Public - for homepage) ────────────
app.get('/api/profiles', async (req, res) => {
    try {
        const profiles = await getAllProfiles();
        const approved = profiles.filter(p => p.isApproved === true);
        res.json(approved);
    } catch (error) {
        console.error('Error fetching profiles:', error);
        res.status(500).json({ error: 'Failed to fetch profiles' });
    }
});

// ─── ACTIVATE PROFILE AFTER PAYMENT ──────────────────────────────
app.post('/api/profiles/me/activate', authenticate, async (req, res) => {
    try {
        const { tier, duration } = req.body;
        const profile = await findProfileByUserId(req.userId);
        
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }
        
        // ─── Update profile to approved ────────────────────────────
        const updated = await updateProfile(profile.slug, {
            isApproved: true,
            status: 'approved',
            approvedAt: new Date().toISOString(),
            subscriptionTier: tier || 'premium',
            subscriptionDuration: duration || 'monthly'
        });
        
        res.json({ 
            success: true,
            message: '✅ Profile activated and live!',
            profile: updated 
        });
    } catch (error) {
        console.error('Activation error:', error);
        res.status(500).json({ 
            success: false,
            message: 'Failed to activate profile',
            error: error.message 
        });
    }
});

// ─── Payment Proxy (Bypass CORS) ──────────────────────────────────


// ─── Payment Proxy (Bypass CORS) ──────────────────────────────────
// ─── Payment Proxy (Bypass CORS) ──────────────────────────────────
// ─── Payment Proxy (Bypass CORS) ──────────────────────────────────
app.post('/api/pay', async (req, res) => {
    console.log('🚀 PAYMENT ROUTE HIT - VERSION 5.0 (no verification)');
    
    try {
        const { name, phone, amount, email } = req.body;
        
        // ─── Get token from headers/body ──────────────────────────
        let recaptchaToken = req.headers['x-recaptcha-token'] || 
                            req.headers['X-Recaptcha-Token'] || 
                            req.body.recaptchaToken;
        
        if (!recaptchaToken) {
            console.log('❌ No reCAPTCHA token found');
            return res.status(400).json({ error: 'Missing reCAPTCHA token' });
        }
        
        // ─── Validate required fields ───────────────────────────────
        if (!phone || !amount) {
            return res.status(400).json({ 
                error: 'Phone number and amount are required' 
            });
        }
        
        // ─── Forward the request to Sarahapay ────────────────────────
        // ✅ NO reCAPTCHA verification here – let Sarahapay handle it
        const response = await fetch('https://sarahapay.onrender.com/api/pay', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Secret': process.env.API_SECRET || '103e07b75c0b3d874cd4376dd0e095729f66d4f268033061aa087df169acc4ac4',
                'X-Recaptcha-Token': recaptchaToken
            },
            body: JSON.stringify({
                name: name || 'FineEscorts Payment',
                phone: phone,
                amount: Number(amount),
                email: email || '',
                recaptchaToken: recaptchaToken // Also in body for compatibility
            })
        });

        const data = await response.json();
        console.log('📥 Sarahapay response:', data);
        
        res.status(response.status).json(data);
    } catch (error) {
        console.error('❌ Payment proxy error:', error);
        res.status(500).json({ 
            error: 'Payment service unavailable',
            details: error.message 
        });
    }
});

// ─── Transaction Status Proxy ─────────────────────────────────────
app.get('/api/transaction/:id', async (req, res) => {
    try {
        const transactionId = req.params.id;
        
        const response = await fetch(`https://sarahapay.onrender.com/api/transaction/${transactionId}`, {
            headers: {
                'X-API-Secret': process.env.API_SECRET || '103e07b75c0b3d874cd4376dd0e095729f66d4f268033061aa087df169acc4ac4'
            }
        });

        const data = await response.json();
        res.status(response.status).json(data);
    } catch (error) {
        console.error('Transaction status error:', error);
        res.status(500).json({ 
            error: 'Transaction status unavailable',
            details: error.message 
        });
    }
});

// ─── Serve Pages ──────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/signup.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/reset-password.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'reset-password.html'));
});

app.get('/dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/admin.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/payment.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'payment.html'));
});

// ─── DYNAMIC PROFILE PAGE ──────────────────────────────────────────
app.get('/profiles/:slug.html', async (req, res) => {
    try {
        const slug = req.params.slug;
        console.log(`🔍 Looking for profile: ${slug}`);
        
        const profile = await findProfileBySlug(slug);
        
        if (!profile) {
            console.log(`❌ Profile not found: ${slug}`);
            return res.status(404).send('Profile not found');
        }
        
        console.log(`✅ Found profile: ${profile.displayName}`);
        
        // Load the template
        const templatePath = path.join(__dirname, 'templates', 'profile-template.html');
        let template = fs.readFileSync(templatePath, 'utf8');
        
        // Build context for the template
        const context = {
            ...profile,
            name: profile.displayName || profile.name,
            city: profile.city || profile.location,
            fullNumber: profile.fullNumber || profile.phone,
            // Add any other fields your template expects
        };
        
        // Render the template
        const html = render(template, context);
        res.send(html);
        
    } catch (error) {
        console.error('❌ Error serving profile:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ─── Cloudinary Configuration ─────────────────────────────────────
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary with individual environment variables
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer storage for Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'fineescorts-profiles',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: [
            { width: 800, height: 1000, crop: 'limit', quality: 'auto' }
        ]
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// ─── PHOTO UPLOAD ENDPOINT ────────────────────────────────────────
app.post('/api/profiles/me/photos', authenticate, upload.array('photos', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No photos uploaded' });
        }

        // Get the profile
        const profile = await findProfileByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        // Check photo limit based on subscription tier
        const tier = profile.subscriptionTier || 'free';
        const maxPhotos = { free: 3, standard: 3, premium: 5, vip: 10 }[tier] || 5;
        const existingPhotos = profile.photos || [];
        
        if (existingPhotos.length + req.files.length > maxPhotos) {
            return res.status(400).json({ 
                message: `Maximum ${maxPhotos} photos allowed. You already have ${existingPhotos.length}.` 
            });
        }

        // Get Cloudinary URLs from uploaded files
        const photoUrls = req.files.map(file => file.path);

        // Update profile with new photos
        const allPhotos = [...existingPhotos, ...photoUrls];
        const updated = await updateProfile(profile.slug, { photos: allPhotos });

        res.json({
            message: '✅ Photos uploaded successfully',
            photos: updated.photos
        });
    } catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({
            message: 'Failed to upload photos',
            error: error.message
        });
    }
});

// ─── DELETE PHOTO ENDPOINT ────────────────────────────────────────
app.delete('/api/profiles/me/photos', authenticate, async (req, res) => {
    try {
        const { photoUrl } = req.body;
        if (!photoUrl) {
            return res.status(400).json({ message: 'Photo URL required' });
        }

        const profile = await findProfileByUserId(req.userId);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        // Remove the photo from the array
        const updatedPhotos = (profile.photos || []).filter(p => p !== photoUrl);
        const updated = await updateProfile(profile.slug, { photos: updatedPhotos });

        res.json({
            message: '✅ Photo deleted successfully',
            photos: updated.photos
        });
    } catch (error) {
        console.error('Delete photo error:', error);
        res.status(500).json({
            message: 'Failed to delete photo',
            error: error.message
        });
    }
});

// ─── Start Server ──────────────────────────────────────────────────
async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 FineEscorts Server running at http://localhost:${PORT}`);
        console.log(`📊 API endpoints at http://localhost:${PORT}/api/`);
        console.log(`📁 Database: ${db ? 'MongoDB Atlas ✅' : 'File-based storage ⚠️'}`);
    });
}

startServer();