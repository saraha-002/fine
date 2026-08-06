const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('.'));

// ─── File-Based Database ───────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Helper: Read/write JSON files
function readJSON(file, defaultVal = []) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        return defaultVal;
    } catch (e) {
        console.warn(`⚠️ Error reading ${file}:`, e.message);
        return defaultVal;
    }
}

function writeJSON(file, data) {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`❌ Error writing ${file}:`, e.message);
    }
}

// ─── Data Stores ──────────────────────────────────────────────────
let users = readJSON(USERS_FILE, {});
let profiles = readJSON(PROFILES_FILE, []);  // Keep as ARRAY
let subscriptions = readJSON(SUBSCRIPTIONS_FILE, {});

// ─── MIGRATION: Auto-upgrade existing profiles to new schema ────
let profilesChanged = false;
profiles = profiles.map(p => {
    let changed = false;
    // Add missing fields with safe defaults
    if (!p.displayName) { p.displayName = p.name || p.displayName || 'Unnamed'; changed = true; }
    if (!p.location) { p.location = p.city || 'Unknown'; changed = true; }
    if (!p.phone) { p.phone = p.fullNumber || ''; changed = true; }
    if (!p.photos) { p.photos = p.images || []; changed = true; }
    if (!p.services) { p.services = []; changed = true; }
    if (!p.userId) { p.userId = null; changed = true; } // Legacy profiles have no owner
    if (!p.status) { 
        // Existing profiles are APPROVED by default so they stay live
        p.status = 'approved'; 
        p.isApproved = true;
        changed = true; 
    }
    if (!p.createdAt) { p.createdAt = new Date().toISOString(); changed = true; }
    if (!p.profileViews && p.profileViews !== 0) { p.profileViews = 0; changed = true; }
    if (p.isApproved === undefined) { p.isApproved = true; changed = true; }
    return p;
});

if (profilesChanged) {
    writeJSON(PROFILES_FILE, profiles);
    console.log(`✅ Migrated ${profiles.length} existing profiles to new schema (all marked as APPROVED)`);
}

// ─── Helper Functions ─────────────────────────────────────────────
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function findUserByEmail(email) {
    for (const [id, user] of Object.entries(users)) {
        if (user.email === email) return { id, ...user };
    }
    return null;
}

function findUserById(id) {
    return users[id] ? { id, ...users[id] } : null;
}

function findProfileBySlug(slug) {
    return profiles.find(p => p.slug === slug);
}

function findProfileByUserId(userId) {
    return profiles.find(p => p.userId === userId);
}

function getProfilesByStatus(status) {
    return profiles.filter(p => p.status === status);
}

// ─── Auth Middleware ──────────────────────────────────────────────
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    let userId = null;
    for (const [id, user] of Object.entries(users)) {
        if (user.token === token) {
            userId = id;
            break;
        }
    }
    if (!userId) {
        return res.status(401).json({ message: 'Invalid token' });
    }
    req.userId = userId;
    next();
}

// ─── Routes ────────────────────────────────────────────────────────

// ─── Auth Routes ──────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
    }
    if (findUserByEmail(email)) {
        return res.status(409).json({ message: 'Email already registered' });
    }
    const userId = crypto.randomBytes(16).toString('hex');
    const token = generateToken();
    users[userId] = {
        email,
        password, // ⚠️ Hash this with bcrypt in production!
        token,
        role: 'escort',
        createdAt: new Date().toISOString()
    };
    writeJSON(USERS_FILE, users);
    res.status(201).json({
        message: 'Registration successful',
        token,
        userId,
        user: { email, role: 'escort' }
    });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password required' });
    }
    const user = findUserByEmail(email);
    if (!user || user.password !== password) {
        return res.status(401).json({ message: 'Invalid credentials' });
    }
    // Refresh token
    const token = generateToken();
    users[user.id].token = token;
    writeJSON(USERS_FILE, users);

    const profile = findProfileByUserId(user.id);
    const subStatus = profile ? subscriptions[profile.slug] || { active: false } : { active: false };

    res.json({
        message: 'Login successful',
        token,
        user: { email: user.email, role: user.role || 'escort' },
        subscription: {
            active: subStatus.active || false,
            expired: subStatus.expiry ? new Date(subStatus.expiry) < new Date() : false
        }
    });
});

app.post('/api/auth/reset-password', (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token and new password required' });
    }
    for (const [id, user] of Object.entries(users)) {
        if (user.resetToken === token) {
            users[id].password = newPassword;
            delete users[id].resetToken;
            writeJSON(USERS_FILE, users);
            return res.json({ message: 'Password reset successful' });
        }
    }
    res.status(404).json({ message: 'Invalid or expired reset token' });
});

// ─── Profile Routes ───────────────────────────────────────────────
app.get('/api/profiles/me', authenticate, (req, res) => {
    const profile = findProfileByUserId(req.userId);
    if (!profile) {
        return res.status(404).json({ message: 'Profile not found' });
    }
    const sub = subscriptions[profile.slug] || { active: false };
    const result = {
        ...profile,
        subscription: {
            active: sub.active || false,
            tier: sub.tier || 'free',
            duration: sub.duration || 'none',
            amount: sub.amount || 0,
            expiryDate: sub.expiry || null
        }
    };
    res.json(result);
});

app.post('/api/profiles', authenticate, (req, res) => {
    const { displayName, age, location, ethnicity, description, services, phone } = req.body;
    if (!displayName || !age || !location || !description || !phone) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    if (findProfileByUserId(req.userId)) {
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
    profiles.push(newProfile);
    writeJSON(PROFILES_FILE, profiles);
    res.status(201).json({
        message: 'Profile created successfully. Awaiting admin approval.',
        profile: newProfile
    });
});

app.put('/api/profiles/me', authenticate, (req, res) => {
    const index = profiles.findIndex(p => p.userId === req.userId);
    if (index === -1) {
        return res.status(404).json({ message: 'Profile not found' });
    }
    const { displayName, age, location, ethnicity, description, services, phone, photos } = req.body;
    if (displayName) { profiles[index].displayName = displayName; profiles[index].name = displayName; }
    if (age) { profiles[index].age = parseInt(age); }
    if (location) { profiles[index].location = location; profiles[index].city = location; }
    if (ethnicity !== undefined) { profiles[index].ethnicity = ethnicity; }
    if (description) { profiles[index].description = description; }
    if (services) { profiles[index].services = services; }
    if (phone) { profiles[index].phone = phone; profiles[index].fullNumber = phone; }
    if (photos) { profiles[index].photos = photos; profiles[index].images = photos; }
    profiles[index].updatedAt = new Date().toISOString();
    writeJSON(PROFILES_FILE, profiles);
    res.json({
        message: 'Profile updated successfully',
        profile: profiles[index]
    });
});

app.post('/api/profiles/me/photos', authenticate, (req, res) => {
    // ⚠️ In production, use multer for file uploads.
    // For now, this is a placeholder.
    res.json({ message: 'Photo upload endpoint (integrate multer)', photos: [] });
});

app.post('/api/profiles/me/activate', authenticate, (req, res) => {
    const { tier, duration } = req.body;
    const index = profiles.findIndex(p => p.userId === req.userId);
    if (index === -1) {
        return res.status(404).json({ message: 'Profile not found' });
    }
    const slug = profiles[index].slug;
    const sub = subscriptions[slug] || {};
    if (!sub.active) {
        return res.status(400).json({ message: 'No active subscription found. Please complete payment first.' });
    }
    profiles[index].isApproved = true;
    profiles[index].status = 'approved';
    profiles[index].subscriptionTier = tier || sub.tier;
    profiles[index].subscriptionDuration = duration || sub.duration;
    profiles[index].activatedAt = new Date().toISOString();
    writeJSON(PROFILES_FILE, profiles);
    res.json({
        message: '✅ Profile activated successfully! Your profile is now live.',
        profile: profiles[index]
    });
});

// ─── Admin Routes ──────────────────────────────────────────────────
app.get('/api/admin/stats', authenticate, (req, res) => {
    const user = findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const pending = profiles.filter(p => p.status === 'pending' || !p.isApproved).length;
    const approved = profiles.filter(p => p.status === 'approved' || p.isApproved).length;
    const rejected = profiles.filter(p => p.status === 'rejected').length;
    res.json({ pending, approved, rejected, total: profiles.length });
});

app.get('/api/admin/profiles', authenticate, (req, res) => {
    const user = findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { status } = req.query;
    let result = profiles;
    if (status === 'pending') {
        result = profiles.filter(p => p.status === 'pending' || !p.isApproved);
    } else if (status === 'approved') {
        result = profiles.filter(p => p.status === 'approved' || p.isApproved);
    } else if (status === 'rejected') {
        result = profiles.filter(p => p.status === 'rejected');
    }
    res.json(result);
});

app.put('/api/admin/profiles/:slug/approve', authenticate, (req, res) => {
    const user = findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const slug = req.params.slug;
    const index = profiles.findIndex(p => p.slug === slug);
    if (index === -1) {
        return res.status(404).json({ message: 'Profile not found' });
    }
    profiles[index].isApproved = true;
    profiles[index].status = 'approved';
    profiles[index].approvedAt = new Date().toISOString();
    writeJSON(PROFILES_FILE, profiles);
    res.json({ message: '✅ Profile approved successfully', profile: profiles[index] });
});

app.delete('/api/admin/profiles/:slug', authenticate, (req, res) => {
    const user = findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const slug = req.params.slug;
    const index = profiles.findIndex(p => p.slug === slug);
    if (index === -1) {
        return res.status(404).json({ message: 'Profile not found' });
    }
    profiles.splice(index, 1);
    writeJSON(PROFILES_FILE, profiles);
    res.json({ message: '❌ Profile rejected and deleted successfully' });
});

// ─── Subscription Routes ──────────────────────────────────────────
app.post('/api/subscribe', (req, res) => {
    const { slug, plan, tier, duration, amount } = req.body;
    if (!slug) {
        return res.status(400).json({ message: 'Profile slug required' });
    }
    subscriptions[slug] = {
        active: true,
        tier: tier || plan || 'verified',
        duration: duration || 'monthly',
        amount: amount || 500,
        startedAt: new Date().toISOString(),
        expiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    writeJSON(SUBSCRIPTIONS_FILE, subscriptions);
    console.log(`✅ Subscription activated for ${slug}`);
    res.json({
        success: true,
        message: 'Subscription activated successfully',
        subscription: subscriptions[slug]
    });
});

app.post('/api/payment/callback', (req, res) => {
    const { transactionId, status, metadata } = req.body;
    console.log(`📲 Payment callback: ${transactionId} -> ${status}`);
    if (status === 'SUCCESS' || status === 'COMPLETED') {
        const slug = metadata?.slug;
        if (slug && subscriptions[slug]) {
            subscriptions[slug].active = true;
            subscriptions[slug].paidAt = new Date().toISOString();
            writeJSON(SUBSCRIPTIONS_FILE, subscriptions);
            console.log(`✅ Payment success: ${slug} activated`);
        }
        res.json({ success: true, message: 'Payment processed' });
    } else {
        res.json({ success: false, message: 'Payment failed' });
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

// ─── Static Profiles ──────────────────────────────────────────────
app.get('/profiles/:slug.html', (req, res) => {
    const filePath = path.join(__dirname, 'profiles', `${req.params.slug}.html`);
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send('Profile not found');
    }
});

// ─── Start Server ──────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 FineEscorts Server running at http://localhost:${PORT}`);
    console.log(`📊 API endpoints at http://localhost:${PORT}/api/`);
    console.log(`📁 Total profiles loaded: ${profiles.length}`);
    console.log(`✅ All existing profiles automatically marked as APPROVED (live on site)`);
    console.log(`📝 New signups will be added to the same array (pending admin approval)`);
});