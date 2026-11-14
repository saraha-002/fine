// ─── Fetch polyfill for older Node versions ──────────────────────
if (!global.fetch) {
    global.fetch = require('node-fetch');
}

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcrypt');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit'); // ← CHANGED: required by v8 for IPv6-safe keyGenerator

require('dotenv').config();

const {
    sendWelcomeEmail,
    sendApprovalEmail,
    sendPaymentConfirmation,
    sendSubscriptionExpiredEmail,
    sendEmail,
    sendAdminNewSignupNotification
} = require('./utils/emailService');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1);

// ─── Rate Limiters ───────────────────────────────────────────────
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { message: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
});

const paymentLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,                     // ← CHANGED: 10/hour per user (not 30)
    message: { message: 'Too many payment attempts. Please wait an hour and try again.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip), // ← CHANGED: ipKeyGenerator for IPv6
});

const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { message: 'Too many admin requests, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ─── Middleware ──────────────────────────────────────────────────
app.use(compression());

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
// ← CHANGED: removed `app.use('/api/pay', paymentLimiter);` — paymentLimiter now mounted inline on the route
app.use('/api/admin/', adminLimiter);

app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

// ─── Block sensitive server-side files from static serving ──────
app.use((req, res, next) => {
    const p = req.path.toLowerCase();
    if (
        p === '/server.js' ||
        p === '/package.json' ||
        p === '/package-lock.json' ||
        p === '/.env' ||
        p.startsWith('/utils/') ||
        p.startsWith('/node_modules/') ||
        p.startsWith('/emailTemplates/') ||
        p.startsWith('/templates/') ||
        p.startsWith('/data/') ||
        /^\/[^/]+\.(js|json)$/i.test(p)
    ) {
        return res.status(404).send('Not found');
    }
    next();
});

// ─── MongoDB Connection ─────────────────────────────────────────
const MONGO_URL = process.env.MONGO_URL;
let db = null;

async function connectDB() {
    try {
        if (!MONGO_URL) {
            console.error('❌ MONGO_URL not set — falling back to file storage');
            return false;
        }
        const client = new MongoClient(MONGO_URL);
        await client.connect();
        db = client.db('fineescorts');
        console.log('✅ Connected to MongoDB Atlas successfully!');

        const collections = await db.listCollections().toArray();
        const names = collections.map(c => c.name);
        for (const name of ['users', 'profiles', 'subscriptions', 'reviews', 'pendingPayments']) {
            if (!names.includes(name)) {
                await db.createCollection(name);
                console.log(`📁 Created "${name}" collection`);
            }
        }

        try {
            const profilesCol = db.collection('profiles');
            await profilesCol.createIndex({ slug: 1 });
            await profilesCol.createIndex({ isApproved: 1 });
            await profilesCol.createIndex({ city: 1 });
            await profilesCol.createIndex({ createdAt: -1 });
            await profilesCol.createIndex({ userId: 1 });
            await profilesCol.createIndex({ phone: 1 });
            await profilesCol.createIndex({ tumaCheckoutId: 1 });
            await profilesCol.createIndex({ isApproved: 1, createdAt: -1 });

            const pendingCol = db.collection('pendingPayments');
            await pendingCol.createIndex({ checkoutRequestId: 1 }, { unique: true });
            await pendingCol.createIndex({ phone: 1 });
            await pendingCol.createIndex({ phone: 1, status: 1, createdAt: -1 }); // ← CHANGED: supports cooldown query
            console.log('✅ Indexes ensured');
        } catch (indexErr) {
            console.log('ℹ️ Indexes may already exist:', indexErr.message);
        }

        await migrateProfiles();
        return true;
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        return false;
    }
}

async function migrateProfiles() {
    try {
        const profilesCol = db.collection('profiles');
        const count = await profilesCol.countDocuments();
        if (count === 0) {
            console.log('📁 Seeding profiles from data/profiles.json...');
            const jsonPath = path.join(__dirname, 'data', 'profiles.json');
            if (fs.existsSync(jsonPath)) {
                const raw = await fsPromises.readFile(jsonPath, 'utf8');
                const profiles = JSON.parse(raw);
                if (profiles.length > 0) {
                    const result = await profilesCol.insertMany(profiles);
                    console.log(`✅ Seeded ${result.insertedCount} profiles`);
                }
            } else {
                console.warn('⚠️ data/profiles.json not found, skipping seed');
            }
        } else {
            console.log(`✅ ${count} profiles already in database`);
        }
    } catch (err) {
        console.error('⚠️ Migration error:', err.message);
    }
}

// ─── Tuma Token Cache (MODULE SCOPE) ─────────────────────────────
let tumaTokenCache = { token: null, expiresAt: 0 };

async function getTumaToken() {
    if (tumaTokenCache.token && Date.now() < tumaTokenCache.expiresAt) {
        return tumaTokenCache.token;
    }

    if (!process.env.TUMA_API_URL || !process.env.TUMA_EMAIL || !process.env.TUMA_API_KEY) {
        throw new Error('Tuma env vars (TUMA_API_URL, TUMA_EMAIL, TUMA_API_KEY) missing');
    }

    const res = await fetch(`${process.env.TUMA_API_URL}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: process.env.TUMA_EMAIL,
            api_key: process.env.TUMA_API_KEY
        })
    });

    const data = await res.json();
    const token = data?.data?.token || data?.token;
    if (!res.ok || !data.success || !token) {
        throw new Error(data.message || `Tuma auth failed (HTTP ${res.status})`);
    }

    tumaTokenCache = {
        token,
        expiresAt: Date.now() + 20 * 60 * 60 * 1000
    };
    return token;
}

// ─── reCAPTCHA Verification ─────────────────────────────────────
async function verifyRecaptcha(token) {
    if (!token) return false;
    const secret = process.env.RECAPTCHA_SECRET_KEY;
    if (!secret) {
        console.error('❌ RECAPTCHA_SECRET_KEY not set');
        return false;
    }
    try {
        const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`
        });
        const data = await response.json();
        console.log('🔍 reCAPTCHA:', data.success ? 'PASS' : 'FAIL', data['error-codes'] || '');
        return data.success === true;
    } catch (err) {
        console.error('reCAPTCHA error:', err.message);
        return false;
    }
}

// ─── DB Helpers ─────────────────────────────────────────────────
function getCollection(name) {
    return db ? db.collection(name) : null;
}

// ─── File-based Fallback ────────────────────────────────────────
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readJSON(file, defaultVal = []) {
    try {
        const filePath = path.join(DATA_DIR, file);
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

// ─── General Helpers ────────────────────────────────────────────
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[m]));
}

function sanitizeName(name) {
    if (!name) return '';
    return name.replace(/[\u{1F600}-\u{1F64F}]/gu, '').replace(/[^\w\s\-']/g, '').trim();
}

function formatWhatsAppNumber(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) cleaned = '254' + cleaned.substring(1);
    if (!cleaned.startsWith('254')) cleaned = '254' + cleaned;
    return cleaned;
}

function seededHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function render(template, context) {
    let result = template;
    for (const [key, value] of Object.entries(context)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value !== undefined ? value : '');
    }
    return result;
}

// ─── City Landmarks ─────────────────────────────────────────────
const cityLandmarksList = {
    "Kitengela": [
        "near Yukos, Milimani, Acacia, and along Namanga Road",
        "close to Acacia Premier Hotel",
        "off Namanga Road near Gateway Mall",
        "within reach of Kitengela town centre",
        "convenient for travelers on Mombasa Road"
    ],
    "Syokimau": [
        "near Kings Gate Estate, Syokimau Railway Station, and the Expressway",
        "close to the Expressway and JKIA",
        "off Mombasa Road near SGR station",
        "within easy reach of Gateway Mall"
    ],
    "Mlolongo": [
        "close to Mlolongo town centre and the Jomo Kenyatta International Airport",
        "near JKIA and the Expressway",
        "along Mombasa Road near the airport"
    ],
    "Imara Daima": [
        "in the Imara Daima estate, near Signature Mall and T-Mall",
        "off Mombasa Road near the Eastern Bypass",
        "close to major hotels and the SGR"
    ],
    "Athiriver": [
        "along Mombasa Road, near Athiriver town and the Industrial Area",
        "close to the Athiriver township",
        "near the junction of Mombasa Road and the Eastern Bypass"
    ]
};

// ─── Service Clusters ───────────────────────────────────────────
const serviceClusters = {
    luxury: ["Fine Dining Companion", "Executive Social Events", "Weekend Retreats", "Luxury Travel Companion", "VIP Evenings"],
    relaxed: ["Casual Meetups", "Friendly Company", "Lounge Dates", "Conversation & Coffee", "Private Evenings"],
    massage: ["Sensual Massage", "Relaxation Sessions", "Couples Massage", "Bodywork & Touch", "Stress Relief"],
    travel: ["Airport Meetups", "Weekend Travel", "Hotel Visits", "Business Trip Companion", "Overnight Stays"],
    social: ["Dinner Dates", "Party Companion", "Event Attendance", "Social Outings", "Club Nights"]
};

function getServiceCluster(profile) {
    const hash = seededHash(profile.slug || 'default');
    const names = Object.keys(serviceClusters);
    const services = serviceClusters[names[hash % names.length]];
    const shuffled = [...services];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (hash + i) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 4).map(s => `<span class="service">${escapeHtml(s)}</span>`).join('');
}

// ─── FAQ Pools ──────────────────────────────────────────────────
const faqPools = [
    [
        { q: "Is {{name}} a verified escort in {{city}}?", a: "Yes, {{name}} has completed our identity verification process and is a verified companion in {{city}}." },
        { q: "Where in {{city}} is {{name}} available?", a: "{{name}} is available for incalls in secure, upscale locations within {{city}} and nearby areas. Outcalls to reputable hotels in {{city}} are also welcome." },
        { q: "Does {{name}} offer overnight or travel companionship?", a: "{{name}} offers overnight stays and can accompany you on weekend getaways around {{city}} or Nairobi." },
        { q: "How do I book {{name}}?", a: "Visit {{name}}'s profile, view her contact details, and reach out directly via call or WhatsApp. All profiles are verified and ready to connect." }
    ],
    [
        { q: "Is my privacy guaranteed when booking {{name}}?", a: "Absolutely. Discretion is {{name}}'s top priority. All communications are confidential." },
        { q: "Can I request a specific meetup location in {{city}}?", a: "Yes, outcalls to reputable hotels in {{city}} are welcome." },
        { q: "What is {{name}}'s cancellation policy?", a: "Please give at least 2 hours' notice if you need to cancel or reschedule." },
        { q: "How do I know the photos are real?", a: "All images are verified by our team. You can also request a live verification call." }
    ],
    [
        { q: "Is {{name}} available for upscale events in {{city}}?", a: "Yes, {{name}} is well-suited for luxury dinners, social events, and weekend retreats." },
        { q: "What kind of experiences does {{name}} specialise in?", a: "Luxury companionship, fine dining, travel, and private evenings." },
        { q: "Does {{name}} offer VIP packages?", a: "Please inquire during booking for exclusive arrangements." },
        { q: "How can I be sure {{name}} is genuine?", a: "{{name}} is fully verified through our ID and photo verification process." }
    ],
    [
        { q: "Is {{name}} available for travel outside {{city}}?", a: "Yes, {{name}} can accompany you on weekend getaways to Nairobi or other nearby destinations." },
        { q: "What are the travel conditions?", a: "All travel expenses (transport, accommodation) are covered by the client." },
        { q: "Does {{name}} offer overnight stays?", a: "Absolutely, overnight and extended dates are available upon request." },
        { q: "How to book a multi-day trip?", a: "Contact {{name}} directly using the WhatsApp or Call buttons on her profile." }
    ]
];

function getRandomFaqs(profile, poolCount = 4) {
    const hash = seededHash(profile.slug || 'default');
    const pool = faqPools[hash % faqPools.length];
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (hash + i) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const selected = shuffled.slice(0, Math.min(poolCount, shuffled.length));
    const landmarks = cityLandmarksList[profile.city] || ["secure location", "the area"];
    const landmark1 = landmarks[hash % landmarks.length];
    const landmark2 = landmarks[(hash + 1) % landmarks.length];
    return selected.map(faq => {
        const q = faq.q
            .replace(/{{name}}/g, profile.displayName || profile.name)
            .replace(/{{city}}/g, profile.city || profile.location)
            .replace(/{{landmark1}}/g, landmark1)
            .replace(/{{landmark2}}/g, landmark2);
        const a = faq.a
            .replace(/{{name}}/g, profile.displayName || profile.name)
            .replace(/{{city}}/g, profile.city || profile.location)
            .replace(/{{landmark1}}/g, landmark1)
            .replace(/{{landmark2}}/g, landmark2);
        return `<div class="faq-item"><h3>${escapeHtml(q)}</h3><p>${escapeHtml(a)}</p></div>`;
    }).join('');
}

// ─── Footer / Related Helpers ───────────────────────────────────
async function getAllCities() {
    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        const profiles = await profilesCol.find({}, { projection: { city: 1, location: 1 } }).toArray();
        return [...new Set(profiles.map(p => p.city || p.location).filter(Boolean))].sort();
    }
    return [];
}

async function getTopCityLinks() {
    const cities = await getAllCities();
    return cities.map(city => {
        const slug = city.toLowerCase().replace(/ /g, '-');
        return `<a href="../${slug}-escorts.html">${escapeHtml(city)} Escorts</a>`;
    }).join('\n');
}

async function getRelatedProfiles(profile) {
    const profilesCol = getCollection('profiles');
    if (!profilesCol) return '';
    const city = (profile.city || profile.location || '').trim();
    if (!city) return '';

    const cityRegex = new RegExp('^' + city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    const sameCity = await profilesCol.find({
        $or: [
            { city: { $regex: cityRegex } },
            { location: { $regex: cityRegex } }
        ],
        slug: { $ne: profile.slug },
        isApproved: true
    }).toArray();

    const hash = seededHash(profile.slug || 'default');
    const shuffled = [...sameCity];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (hash + i) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 6)
        .map(p => `<a href="${p.slug}.html">${escapeHtml(sanitizeName(p.displayName || p.name))}</a>`)
        .join('\n');
}

// ─── Auth Middleware ────────────────────────────────────────────
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: 'No token provided' });
    const token = authHeader.split(' ')[1];
    const usersCol = getCollection('users');
    if (usersCol) {
        const user = await usersCol.findOne({ token });
        if (!user) return res.status(401).json({ message: 'Invalid token' });
        req.userId = user._id.toString();
        req.user = user;
        return next();
    }
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

// ─── DB Query Functions ─────────────────────────────────────────
async function findUserByEmail(email) {
    const usersCol = getCollection('users');
    if (usersCol) return await usersCol.findOne({ email });
    const users = readJSON('users.json', {});
    for (const [id, user] of Object.entries(users)) {
        if (user.email === email) return { id, ...user };
    }
    return null;
}

async function findUserById(id) {
    const usersCol = getCollection('users');
    if (usersCol) {
        try { return await usersCol.findOne({ _id: new ObjectId(id) }); }
        catch { return null; }
    }
    const users = readJSON('users.json', {});
    return users[id] ? { id, ...users[id] } : null;
}

async function findProfileByUserId(userId) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) return await profilesCol.findOne({ userId });
    return readJSON('profiles.json', []).find(p => p.userId === userId);
}

async function findProfileBySlug(slug) {
    const profilesCol = getCollection('profiles');
    if (profilesCol) return await profilesCol.findOne({ slug });
    return readJSON('profiles.json', []).find(p => p.slug === slug);
}

async function getAllProfiles() {
    const profilesCol = getCollection('profiles');
    if (profilesCol) return await profilesCol.find({}).toArray();
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

// ─── Admin Bootstrap ────────────────────────────────────────────
async function ensureAdminUser() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        console.log('ℹ️ ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin bootstrap');
        return;
    }
    const usersCol = getCollection('users');
    if (!usersCol) return;

    try {
        const existing = await usersCol.findOne({ email: email.toLowerCase().trim() });
        if (existing) {
            if (existing.role !== 'admin') {
                await usersCol.updateOne({ _id: existing._id }, { $set: { role: 'admin' } });
                console.log(`✅ Ensured ${email} has admin role`);
            } else {
                console.log(`✅ Admin user verified: ${email}`);
            }
            return;
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await usersCol.insertOne({
            _id: new ObjectId(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            token: generateToken(),
            role: 'admin',
            createdAt: new Date().toISOString()
        });
        console.log(`✅ Created admin user: ${email}`);
    } catch (err) {
        console.error('❌ Admin bootstrap failed:', err.message);
    }
}

// ═══════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════

// ─── Auth Routes ────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });
    const existing = await findUserByEmail(email);
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const userId = new ObjectId().toString();
    const token = generateToken();
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        _id: new ObjectId(userId),
        email,
        password: hashedPassword,
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

    try {
        await sendWelcomeEmail(email, email.split('@')[0]);
    } catch (err) {
        console.error('❌ Welcome email failed:', err.message);
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
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

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

    res.json({
        message: 'Login successful',
        token,
        user: { email: user.email, role: user.role || 'escort' },
        subscription: { active: false }
    });
});

// ─── Forgot Password ────────────────────────────────────────────
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await findUserByEmail(email);
    if (!user) {
        return res.status(200).json({ message: 'If that email is registered, you will receive a reset link.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);

    const usersCol = getCollection('users');
    if (usersCol) {
        await usersCol.updateOne(
            { _id: user._id },
            { $set: { resetPasswordToken: token, resetPasswordExpires: expires } }
        );
    } else {
        const users = readJSON('users.json', {});
        if (users[user.id]) {
            users[user.id].resetPasswordToken = token;
            users[user.id].resetPasswordExpires = expires;
            writeJSON('users.json', users);
        }
    }

    const resetLink = `https://fineescorts.co.ke/reset-password.html?token=${token}`;
    try {
        await sendEmail(email, 'Reset Your Password – FineEscorts Kenya', 'reset-password', { resetLink });
    } catch (err) {
        console.error('❌ Reset email failed:', err.message);
    }

    res.status(200).json({ message: 'If that email is registered, you will receive a reset link.' });
});

app.get('/api/auth/reset-password/:token', async (req, res) => {
    const usersCol = getCollection('users');
    if (!usersCol) return res.status(500).json({ message: 'Database error' });
    const user = await usersCol.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });
    res.json({ valid: true, email: user.email });
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: 'Token and new password required' });

    const usersCol = getCollection('users');
    if (!usersCol) return res.status(500).json({ message: 'Database error' });

    const user = await usersCol.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: new Date() }
    });
    if (!user) return res.status(400).json({ message: 'Invalid or expired reset token' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await usersCol.updateOne(
        { _id: user._id },
        {
            $set: { password: hashedPassword },
            $unset: { resetPasswordToken: '', resetPasswordExpires: '' }
        }
    );
    res.json({ message: 'Password reset successfully.' });
});

// ─── Profile Routes ─────────────────────────────────────────────
app.get('/api/profiles/me', authenticate, async (req, res) => {
    const profile = await findProfileByUserId(req.userId);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    res.json(profile);
});

app.post('/api/profiles', authenticate, async (req, res) => {
    const { displayName, age, location, ethnicity, description, services, phone } = req.body;
    if (!displayName || !age || !location || !description || !phone) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    const existing = await findProfileByUserId(req.userId);
    if (existing) return res.status(409).json({ message: 'You already have a profile' });

    const trimmedLocation = location.trim();
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now().toString().slice(-4);
    const newProfile = {
        slug,
        userId: req.userId,
        name: displayName,
        displayName,
        age: parseInt(age),
        city: trimmedLocation,
        location: trimmedLocation,
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

    try {
        const user = await findUserById(req.userId);
        if (user && user.email) {
            saved.email = user.email;
            await sendAdminNewSignupNotification(saved);
        }
    } catch (err) {
        console.error('❌ Admin notification failed:', err.message);
    }

    res.status(201).json({
        message: 'Profile created successfully. Awaiting admin approval.',
        profile: saved
    });
});

app.put('/api/profiles/me', authenticate, async (req, res) => {
    try {
        const { displayName, age, location, ethnicity, description, services, phone, photos } = req.body;
        const profile = await findProfileByUserId(req.userId);
        if (!profile) return res.status(404).json({ message: 'Profile not found' });

        const updates = {};
        if (displayName !== undefined) updates.displayName = displayName;
        if (age !== undefined) updates.age = parseInt(age);
        if (location !== undefined) updates.location = location.trim();
        if (ethnicity !== undefined) updates.ethnicity = ethnicity;
        if (description !== undefined) updates.description = description;
        if (services !== undefined) updates.services = services;
        if (phone !== undefined) {
            updates.phone = phone;
            updates.fullNumber = phone;
        }
        if (photos !== undefined) updates.photos = photos;

        const updated = await updateProfile(profile.slug, updates);
        res.json({ message: '✅ Profile updated successfully', profile: updated });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Failed to update profile', error: error.message });
    }
});

app.delete('/api/profiles/me', authenticate, async (req, res) => {
    const profile = await findProfileByUserId(req.userId);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        const result = await profilesCol.deleteOne({ userId: req.userId });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Profile not found' });
    } else {
        const profiles = readJSON('profiles.json', []);
        const index = profiles.findIndex(p => p.userId === req.userId);
        if (index === -1) return res.status(404).json({ message: 'Profile not found' });
        profiles.splice(index, 1);
        writeJSON('profiles.json', profiles);
    }

    try {
        if (req.user?.email) {
            await sendEmail(req.user.email, 'Profile Deleted – FineEscorts Kenya', 'profile-deleted', { name: profile.displayName });
        }
    } catch (err) {
        console.error('❌ Deletion email failed:', err.message);
    }

    res.json({ message: 'Profile deleted successfully.' });
});

// ─── Admin Routes ───────────────────────────────────────────────
async function requireAdmin(req, res) {
    const user = await findUserById(req.userId);
    if (!user || user.role !== 'admin') {
        res.status(403).json({ message: 'Admin access required' });
        return null;
    }
    return user;
}

app.get('/api/admin/stats', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const profiles = await getAllProfiles();
    const pending = profiles.filter(p => p.status === 'pending' || !p.isApproved).length;
    const approved = profiles.filter(p => p.status === 'approved' || p.isApproved).length;
    const rejected = profiles.filter(p => p.status === 'rejected').length;
    res.json({ pending, approved, rejected, total: profiles.length });
});

app.get('/api/admin/profiles', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { status } = req.query;
    let profiles = await getAllProfiles();
    if (status === 'pending') profiles = profiles.filter(p => p.status === 'pending' || !p.isApproved);
    else if (status === 'approved') profiles = profiles.filter(p => p.status === 'approved' || p.isApproved);
    else if (status === 'rejected') profiles = profiles.filter(p => p.status === 'rejected');
    res.json(profiles);
});

app.put('/api/admin/profiles/:slug/approve', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const updated = await updateProfile(req.params.slug, {
        isApproved: true, status: 'approved', approvedAt: new Date().toISOString()
    });
    if (!updated) return res.status(404).json({ message: 'Profile not found' });

    try {
        const user = await findUserById(updated.userId);
        if (user?.email) {
            await sendApprovalEmail(user.email, updated.displayName || updated.name, 'approved', updated.slug);
        }
    } catch (err) {
        console.error('❌ Approval email failed:', err.message);
    }
    res.json({ message: '✅ Profile approved', profile: updated });
});

app.put('/api/admin/profiles/:slug/feature', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const featured = Boolean(req.body.featured);
    const updates = featured
        ? { featured: true, featuredAt: new Date().toISOString(), buried: false, buriedAt: null }
        : { featured: false, featuredAt: null };
    const updated = await updateProfile(req.params.slug, updates);
    if (!updated) return res.status(404).json({ message: 'Profile not found' });
    res.json({ message: featured ? '⭐ Featured' : 'Unfeatured', profile: updated });
});

app.put('/api/admin/profiles/:slug/bury', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const buried = Boolean(req.body.buried);
    const updates = buried
        ? { buried: true, buriedAt: new Date().toISOString(), featured: false, featuredAt: null }
        : { buried: false, buriedAt: null };
    const updated = await updateProfile(req.params.slug, updates);
    if (!updated) return res.status(404).json({ message: 'Profile not found' });
    res.json({ message: buried ? '⬇️ Buried' : 'Un-buried', profile: updated });
});

app.delete('/api/admin/profiles/:slug', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const slug = req.params.slug;
    const profile = await findProfileBySlug(slug);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });

    try {
        const user = await findUserById(profile.userId);
        if (user?.email) {
            await sendApprovalEmail(user.email, profile.displayName || profile.name, 'rejected', profile.slug, 'Content did not meet our quality standards.');
        }
    } catch (err) {
        console.error('❌ Rejection email failed:', err.message);
    }

    const profilesCol = getCollection('profiles');
    if (profilesCol) {
        const result = await profilesCol.deleteOne({ slug });
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Profile not found' });
    } else {
        const profiles = readJSON('profiles.json', []);
        const index = profiles.findIndex(p => p.slug === slug);
        if (index === -1) return res.status(404).json({ message: 'Profile not found' });
        profiles.splice(index, 1);
        writeJSON('profiles.json', profiles);
    }
    res.json({ message: '❌ Profile rejected and deleted' });
});

app.put('/api/admin/profiles/:slug', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const updates = req.body;
    delete updates._id;
    delete updates.userId;
    delete updates.slug;
    delete updates.createdAt;
    delete updates.profileViews;

    if (updates.age !== undefined && (isNaN(updates.age) || updates.age < 18)) {
        return res.status(400).json({ message: 'Age must be >= 18' });
    }
    const updated = await updateProfile(req.params.slug, updates);
    if (!updated) return res.status(404).json({ message: 'Profile not found' });
    res.json({ message: '✅ Profile updated', profile: updated });
});

app.get('/api/admin/users', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const usersCol = getCollection('users');
    let users;
    if (usersCol) {
        users = await usersCol.find({}).toArray();
    } else {
        users = Object.values(readJSON('users.json', {}));
    }
    const safe = users.map(u => {
        const { password, token, resetPasswordToken, resetPasswordExpires, ...rest } = u;
        return rest;
    });
    res.json(safe);
});

app.get('/api/admin/expired', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const profilesCol = getCollection('profiles');
    if (!profilesCol) return res.json([]);
    const expired = await profilesCol.find({
        isApproved: true,
        subscriptionExpiry: { $lt: new Date() }
    }).toArray();
    res.json(expired);
});

app.post('/api/admin/profiles/:slug/renew', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const profile = await findProfileBySlug(req.params.slug);
    if (!profile) return res.status(404).json({ message: 'Profile not found' });
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 1);
    const updated = await updateProfile(req.params.slug, {
        isApproved: true, status: 'approved', subscriptionExpiry: expiryDate.toISOString()
    });
    res.json({ message: '✅ Subscription renewed', profile: updated });
});

app.post('/api/admin/send-bulk-email', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { subject, message, filter } = req.body;
    if (!subject || !message) return res.status(400).json({ message: 'Subject and message required' });

    const profilesCol = getCollection('profiles');
    if (!profilesCol) return res.status(500).json({ message: 'Database error' });

    const query = {};
    if (filter === 'approved') query.isApproved = true;
    else if (filter === 'pending') query.isApproved = false;
    else if (filter === 'expired') {
        query.isApproved = true;
        query.subscriptionExpiry = { $lt: new Date() };
    }

    const profiles = await profilesCol.find(query).toArray();
    let sent = 0;
    for (const profile of profiles) {
        try {
            const user = await findUserById(profile.userId);
            if (user?.email) {
                await sendEmail(user.email, subject, 'admin-bulk', { name: profile.displayName || profile.name, message });
                sent++;
            }
        } catch (err) {
            console.error('Bulk email failed:', err.message);
        }
    }
    res.json({ message: `✅ Emails sent to ${sent} escorts`, sent, total: profiles.length });
});

// ─── Public Profiles ────────────────────────────────────────────
app.get('/api/profiles', async (req, res) => {
    try {
        const profiles = await getAllProfiles();
        const approved = profiles
            .filter(p => p.isApproved === true)
            .sort((a, b) => {
                const aFeat = a.featured === true ? 1 : 0;
                const bFeat = b.featured === true ? 1 : 0;
                if (aFeat !== bFeat) return bFeat - aFeat;
                if (aFeat && bFeat) {
                    const aF = new Date(a.featuredAt || 0).getTime();
                    const bF = new Date(b.featuredAt || 0).getTime();
                    if (aF !== bF) return bF - aF;
                }
                const aBuried = a.buried === true ? 1 : 0;
                const bBuried = b.buried === true ? 1 : 0;
                if (aBuried !== bBuried) return aBuried - bBuried;
                return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            });
        res.json(approved);
    } catch (error) {
        console.error('Error fetching profiles:', error);
        res.status(500).json({ error: 'Failed to fetch profiles' });
    }
});

app.post('/api/profiles/me/activate', authenticate, async (req, res) => {
    return res.status(403).json({
        message: 'Activation is handled by the payment gateway. Complete payment via /api/pay.'
    });
});

app.post('/api/profiles/:slug/view', async (req, res) => {
    try {
        const profile = await findProfileBySlug(req.params.slug);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        const views = (profile.profileViews || 0) + 1;
        await updateProfile(req.params.slug, { profileViews: views });
        res.json({ views });
    } catch (error) {
        console.error('View increment error:', error);
        res.status(500).json({ error: 'Failed to update views' });
    }
});

// ═══════════════════════════════════════════════════════════════
// TUMA PAYMENT — INITIATION
// ═══════════════════════════════════════════════════════════════
app.post('/api/pay', authenticate, paymentLimiter, async (req, res) => {
    try {
        const { phone, tier, duration, amount } = req.body;
        const userId = req.userId;

        if (!phone) return res.status(400).json({ error: 'Phone number is required' });

        // reCAPTCHA
        const recaptchaToken = req.headers['x-recaptcha-token'] || req.body.recaptchaToken;
        if (process.env.RECAPTCHA_SECRET_KEY) {
            if (!recaptchaToken) return res.status(400).json({ error: 'Missing reCAPTCHA token' });
            const ok = await verifyRecaptcha(recaptchaToken);
            if (!ok) return res.status(400).json({ error: 'reCAPTCHA verification failed' });
        }

        // Tier/amount resolution
        const tierAmounts = {
            standard: { monthly: 500,  yearly: 5000  },
            premium:  { monthly: 1000, yearly: 10000 },
            vip:      { monthly: 2000, yearly: 20000 }
        };
        let resolvedTier = tier, resolvedDuration = duration, resolvedAmount = Number(amount);
        if (resolvedTier && resolvedDuration) {
            resolvedAmount = tierAmounts[resolvedTier]?.[resolvedDuration];
            if (!resolvedAmount) return res.status(400).json({ error: 'Invalid tier/duration' });
        } else if (!resolvedAmount) {
            return res.status(400).json({ error: 'Provide (tier + duration) or amount' });
        }
        if (!resolvedTier || !resolvedDuration) {
            const match = Object.entries(tierAmounts).find(([_, d]) =>
                Object.values(d).includes(resolvedAmount));
            if (match) {
                const [t, d] = match;
                resolvedTier = resolvedTier || t;
                resolvedDuration = resolvedDuration || Object.keys(d).find(k => d[k] === resolvedAmount);
            } else {
                resolvedTier = resolvedTier || 'custom';
                resolvedDuration = resolvedDuration || 'monthly';
            }
        }

        // Verify the logged-in user has a profile
        const profilesCol = getCollection('profiles');
        if (!profilesCol) return res.status(500).json({ error: 'Database unavailable' });

        const profile = await profilesCol.findOne({ userId });
        if (!profile) {
            return res.status(404).json({
                error: 'No profile found for this account. Create a profile before subscribing.'
            });
        }

        // ← CHANGED: phone cooldown — 10 min, but only block if previous attempt wasn't completed
        const pendingCol = getCollection('pendingPayments');
        if (pendingCol) {
            const recentAttempt = await pendingCol.findOne({
                phone,
                status: { $ne: 'completed' },
                createdAt: { $gt: new Date(Date.now() - 10 * 60 * 1000).toISOString() }
            });
            if (recentAttempt) {
                return res.status(429).json({
                    error: 'An M-Pesa prompt was recently sent to this number. Please wait 10 minutes before retrying.'
                });
            }
        }

        // Tuma STK push
        const token = await getTumaToken();
        const response = await fetch(`${process.env.TUMA_API_URL}/payment/stk-push`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount: resolvedAmount,
                phone,
                description: `FineEscorts ${resolvedTier} - ${resolvedDuration}`,
                callback_url: `https://fineescorts.co.ke/payment-callback?k=${process.env.TUMA_WEBHOOK_SECRET}`
            })
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
            return res.status(response.status || 502).json({ error: data.message || 'STK push failed' });
        }
        const checkoutRequestId = data?.data?.checkout_request_id;
        if (!checkoutRequestId) {
            return res.status(502).json({ error: 'Tuma returned no checkout_request_id' });
        }

        // Record pending payment WITH userId (identity anchor)
        if (pendingCol) {
            await pendingCol.insertOne({
                checkoutRequestId,
                userId,
                phone,
                tier: resolvedTier,
                duration: resolvedDuration,
                amount: resolvedAmount,
                createdAt: new Date().toISOString(),
                status: 'pending'
            });
        }

        // Attach to profile by userId (cannot fail)
        await profilesCol.updateOne(
            { userId },
            {
                $set: {
                    tumaCheckoutId: checkoutRequestId,
                    pendingTier: resolvedTier,
                    pendingDuration: resolvedDuration,
                    pendingAmount: resolvedAmount,
                    paymentInitiatedAt: new Date().toISOString()
                }
            }
        );

        console.log(`📤 STK push → ${checkoutRequestId} (user ${userId}, phone ${phone}, ${resolvedTier}/${resolvedDuration} @ KES ${resolvedAmount})`);

        res.status(201).json({
            message: 'STK Push Sent. Complete payment on your phone.',
            transactionId: checkoutRequestId
        });
    } catch (error) {
        console.error('❌ /api/pay error:', error.message);
        res.status(500).json({ error: error.message || 'Payment initiation failed' });
    }
});

// ═══════════════════════════════════════════════════════════════
// TUMA PAYMENT — CALLBACK
// ═══════════════════════════════════════════════════════════════
app.post('/payment-callback', async (req, res) => {
    const incomingSecret = req.query.k;
    if (!process.env.TUMA_WEBHOOK_SECRET || incomingSecret !== process.env.TUMA_WEBHOOK_SECRET) {
        console.warn('❌ Unauthorized /payment-callback from:', req.ip);
        return res.sendStatus(401);
    }

    console.log('📥 Tuma callback:', req.body);
    res.sendStatus(200);

    (async () => {
        try {
            const payload = req.body;
            const status = payload.status;
            const resultCode = payload.result_code;
            const mpesaReceipt = payload.mpesa_receipt_number;
            const amount = payload.amount;
            const checkoutRequestId = payload.checkout_request_id;

            console.log(`📊 status=${status}, result_code=${resultCode}, receipt=${mpesaReceipt}, checkout=${checkoutRequestId}`);

            // ← CHANGED: fetch pending record BEFORE failure check, so we can mark failed payments
            const pendingCol = getCollection('pendingPayments');
            let pending = null;
            if (pendingCol) pending = await pendingCol.findOne({ checkoutRequestId });

            if (status !== 'completed' || resultCode !== 0) {
                console.log(`⏭️ Payment not successful (${status}, code ${resultCode}), recording failure`);
                // ← CHANGED: record failed/cancelled/timeout so cooldown logic works correctly
                if (pendingCol) {
                    await pendingCol.updateOne(
                        { checkoutRequestId },
                        {
                            $set: {
                                status: 'failed',
                                resultDesc: payload.result_desc || payload.failure_reason || null,
                                failedAt: new Date().toISOString()
                            }
                        }
                    );
                }
                return;
            }

            const profilesCol = getCollection('profiles');
            if (!profilesCol) return;

            // ← CHANGED: use userId fallback instead of phone
            let profile = await profilesCol.findOne({ tumaCheckoutId: checkoutRequestId });
            if (!profile && pending?.userId) {
                profile = await profilesCol.findOne({ userId: pending.userId });
            }

            if (!profile) {
                console.log(`⚠️ No profile for checkout_request_id: ${checkoutRequestId}`);
                if (pendingCol) {
                    await pendingCol.updateOne(
                        { checkoutRequestId },
                        { $set: { status: 'paid_no_profile', mpesaReceipt, paidAt: new Date().toISOString() } }
                    );
                }
                return;
            }

            // Idempotency
            if (mpesaReceipt && profile.mpesaReceipt === mpesaReceipt) {
                console.log(`⏭️ Duplicate callback for receipt ${mpesaReceipt}`);
                return;
            }

            const tier = pending?.tier || profile.pendingTier || 'premium';
            const duration = pending?.duration || profile.pendingDuration || 'monthly';

            const expiryDate = new Date();
            if (duration === 'yearly') expiryDate.setFullYear(expiryDate.getFullYear() + 1);
            else if (duration === 'weekly') expiryDate.setDate(expiryDate.getDate() + 7);
            else if (duration === 'daily') expiryDate.setDate(expiryDate.getDate() + 1);
            else expiryDate.setMonth(expiryDate.getMonth() + 1);

            await profilesCol.updateOne(
                { _id: profile._id },
                {
                    $set: {
                        isApproved: true,
                        status: 'approved',
                        approvedAt: new Date().toISOString(),
                        subscriptionTier: tier,
                        subscriptionDuration: duration,
                        subscriptionExpiry: expiryDate.toISOString(),
                        mpesaReceipt: mpesaReceipt || null,
                        lastPaymentDate: new Date().toISOString()
                    },
                    $unset: {
                        tumaCheckoutId: '',
                        pendingTier: '',
                        pendingDuration: '',
                        pendingAmount: ''
                    }
                }
            );

            if (pendingCol) {
                await pendingCol.updateOne(
                    { checkoutRequestId },
                    { $set: { status: 'completed', mpesaReceipt, paidAt: new Date().toISOString() } }
                );
            }

            console.log(`✅ Profile ${profile.slug} activated until ${expiryDate.toISOString()}`);

            try {
                const user = await findUserById(profile.userId);
                if (user?.email) {
                    await sendPaymentConfirmation(
                        user.email,
                        profile.displayName || profile.name,
                        amount || pending?.amount || profile.pendingAmount || 500,
                        tier,
                        mpesaReceipt || 'N/A'
                    );
                    console.log(`✅ Confirmation email sent to ${user.email}`);
                }
            } catch (emailErr) {
                console.error('❌ Email failed:', emailErr.message);
            }
        } catch (error) {
            console.error('❌ Callback processing error:', error);
        }
    })();
});

// ─── Transaction Stub ───────────────────────────────────────────
app.get('/api/transaction/:id', (req, res) => {
    res.json({
        status: 'PENDING',
        transactionId: req.params.id,
        note: 'Tuma does not expose transaction polling; rely on profile status.'
    });
});

// ─── Test Email (admin only) ────────────────────────────────────
app.get('/api/test-email', authenticate, async (req, res) => {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    try {
        const to = req.query.to || admin.email;
        const result = await sendEmail(to, 'Test Email', 'admin-bulk', {
            name: 'Test User',
            message: 'This is a test email.'
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ─── Static Files ───────────────────────────────────────────────
// ─── Static Files ───────────────────────────────────────────────
// Build the static handler once, but only invoke it for paths that
// should be served as literal files. Profile and city pages are
// rendered dynamically from MongoDB further down this file, so we
// skip static for those paths even when a pre-generated file
// exists on disk. That way admin edits are reflected immediately.
const staticHandler = express.static('.', {
    maxAge: '1d',
    dotfiles: 'ignore',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        } else if (filePath.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (filePath.match(/\.(css|js)$/i)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
});

app.use((req, res, next) => {
    const p = req.path;
    // Skip static for profile pages and city pages — let the dynamic
    // routes serve fresh MongoDB data instead of stale disk files.
    if (/^\/profiles\/[^/]+\.html$/i.test(p) || /^\/[^/]+-escorts\.html$/i.test(p)) {
        return next();
    }
    return staticHandler(req, res, next);
});

// ─── Explicit Page Routes ───────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/signup.html', (req, res) => res.sendFile(path.join(__dirname, 'signup.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/reset-password.html', (req, res) => res.sendFile(path.join(__dirname, 'reset-password.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/payment.html', (req, res) => res.sendFile(path.join(__dirname, 'payment.html')));

// ─── Dynamic Profile Page ───────────────────────────────────────
app.get('/profiles/:slug.html', async (req, res) => {
    try {
        const slug = req.params.slug;
        const profile = await findProfileBySlug(slug);
        if (!profile) return res.status(404).send('Profile not found');

        const templatePath = path.join(__dirname, 'templates', 'profile-template.html');
        let template;
        try {
            template = await fsPromises.readFile(templatePath, 'utf8');
        } catch (err) {
            console.error('❌ Failed to read profile template:', err.message);
            return res.status(500).send('Template not found');
        }

        const fullNumber = profile.fullNumber || profile.phone || '';
        const displayName = profile.displayName || profile.name || 'Unknown';
        const city = profile.city || profile.location || 'Unknown';

        const images = profile.photos || profile.images || [];
        let galleryHtml = '<div class="gallery">No images</div>';
        if (images.length > 0) {
            galleryHtml = `
                <div class="thumbs">
                    ${images.map((img, idx) => `
                        <img src="${img}" class="thumb ${idx === 0 ? 'active' : ''}" alt="${escapeHtml(displayName)} - ${escapeHtml(city)} escort photo ${idx + 1}" width="80" height="80" loading="lazy">
                    `).join('\n')}
                </div>
                <div class="main-image">
                    ${images.map((img, idx) => `
                        <img src="${img}" class="main ${idx === 0 ? 'active' : ''}" alt="${escapeHtml(displayName)} - verified escort in ${escapeHtml(city)}" width="400" height="500" loading="${idx === 0 ? 'eager' : 'lazy'}">
                    `).join('\n')}
                </div>
            `;
        }

        let reviewsHtml = '<p>No reviews yet. Be the first to review!</p>';
        if (profile.reviews && profile.reviews.length > 0) {
            reviewsHtml = profile.reviews.slice(0, 3).map(r => {
                const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
                return `
                    <div class="review-card">
                        <div class="review-stars">${stars}</div>
                        <div class="review-text">"${escapeHtml(r.comment)}"</div>
                        <div class="review-author">${escapeHtml(r.author)} <span>• Verified client</span></div>
                    </div>
                `;
            }).join('');
        }

        let topReviewsHtml = '';
        if (profile.reviews && profile.reviews.length > 0) {
            topReviewsHtml = profile.reviews.slice(0, 2).map(r => `
                <div class="preview-review-item">
                    <div class="preview-review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
                    <div>"${escapeHtml(r.comment)}"</div>
                    <div style="font-size:0.7rem; color:#888;">— ${escapeHtml(r.author)}</div>
                </div>
            `).join('');
        }

        const context = {
            name: displayName,
            displayName,
            city,
            location: city,
            age: profile.age || 'N/A',
            fullNumber,
            maskedNumber: profile.maskedNumber || '07XX XXX XXX',
            slug: profile.slug || slug,
            lastUpdated: profile.updatedAt
                ? Math.max(1, Math.floor((Date.now() - new Date(profile.updatedAt).getTime()) / 86400000))
                : Math.floor(Math.random() * 7) + 1,
            profileViews: profile.profileViews || 0,
            memberSince: profile.createdAt
                ? new Date(profile.createdAt).toLocaleString('default', { month: 'long', year: 'numeric' })
                : 'Recently',
            gallery: galleryHtml,
            bioHtml: profile.description ? `<p>${escapeHtml(profile.description)}</p>` : '<p>No description available.</p>',
            services: (profile.services && profile.services.length > 0)
                ? profile.services.map(s => `<span class="service">${escapeHtml(s)}</span>`).join('')
                : getServiceCluster(profile),
            reviews: reviewsHtml,
            topReviewsHtml,
            faqHtml: getRandomFaqs(profile, 4),
            topCityLinks: await getTopCityLinks(),
            relatedProfiles: await getRelatedProfiles(profile),
            escortId: profile.slug ? profile.slug.replace(/-/g, '_').toUpperCase() : 'UNKNOWN',
            verifiedBadge: profile.verified
                ? '<span class="verified-badge" title="ID &amp; Photo Verified"><i class="fas fa-check-circle"></i> Verified</span>'
                : '',
            vipBadge: '',
            ethnicityPart: profile.ethnicity ? ` · ${profile.ethnicity}` : '',
            waNumber: formatWhatsAppNumber(fullNumber),
            trustBadgesHtml: '',
            localTipHtml: '',
            title: `${displayName} – Verified Escort in ${city}`,
            metaDescription: profile.description ? profile.description.substring(0, 160) : 'Verified escort profile.',
            heroImage: images.length > 0 ? images[0] : '',
            ogImage: images.length > 0 ? images[0] : '',
            baseUrl: 'https://fineescorts.co.ke',
            citySlug: city.toLowerCase().replace(/ /g, '-'),
            jsonLd: '{}',
            today: new Date().toISOString().split('T')[0],
            publishedDate: profile.createdAt || new Date().toISOString(),
            socialMedia: [],
            firstName: displayName.split(' ')[0] || displayName,
            lastName: displayName.split(' ').slice(1).join(' ') || '',
            viewCounterScript: `<script>
                (async function() {
                    try {
                        const slug = window.location.pathname.split('/').pop().replace('.html', '');
                        await fetch('/api/profiles/' + slug + '/view', { method: 'POST' });
                    } catch (e) {}
                })();
            </script>`
        };

        res.send(render(template, context));
    } catch (error) {
        console.error('❌ Error serving profile:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ─── Dynamic City Page ──────────────────────────────────────────
app.get('/:citySlug-escorts.html', async (req, res) => {
    try {
        const citySlug = req.params.citySlug;
        const allProfiles = await getAllProfiles();
        const approved = allProfiles.filter(p => p.isApproved === true);
        const cityName = citySlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        const cityProfiles = approved.filter(p =>
            (p.city && p.city.toLowerCase() === cityName.toLowerCase()) ||
            (p.location && p.location.toLowerCase() === cityName.toLowerCase())
        );

        const templatePath = path.join(__dirname, 'templates', 'city-template.html');
        let template;
        try {
            template = await fsPromises.readFile(templatePath, 'utf8');
        } catch (err) {
            console.error('❌ Failed to read city template:', err.message);
            return res.status(500).send('City template not found');
        }

        const profilesHtml = cityProfiles.map(p => {
            const image = (p.photos && p.photos.length > 0) ? p.photos[0]
                : (p.images && p.images.length > 0) ? p.images[0] : '';
            const displayName = p.displayName || p.name || 'Unknown';
            return `
                <div class="escort-card">
                    <img class="escort-card-image" src="${image}" alt="${escapeHtml(displayName)} verified escort in ${escapeHtml(cityName)}" loading="lazy">
                    <div class="escort-card-content">
                        <div class="escort-card-name">${escapeHtml(displayName)}</div>
                        <div class="escort-card-location">${escapeHtml(cityName)}</div>
                        <a href="profiles/${p.slug}.html" class="view-profile-btn">View Profile</a>
                    </div>
                </div>
            `;
        }).join('');

        const allCities = [...new Set(approved.map(p => p.city || p.location).filter(Boolean))];
        const cityLinks = allCities.map(c => {
            const s = c.toLowerCase().replace(/ /g, '-');
            return `<a href="${s}-escorts.html">${escapeHtml(c)} Escorts</a>`;
        }).join('\n');

        const context = {
            baseUrl: 'https://fineescorts.co.ke',
            city: cityName,
            citySlug,
            profileCount: cityProfiles.length,
            profiles: profilesHtml,
            topCityLinks: cityLinks,
            relatedProfiles: '',
            jsonld: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "ItemList",
                "name": `${cityName} Escorts`,
                "description": `List of premium escort companions available in ${cityName}, Kenya.`,
                "url": `https://fineescorts.co.ke/${citySlug}-escorts.html`,
                "numberOfItems": cityProfiles.length,
                "itemListElement": cityProfiles.map((p, idx) => ({
                    "@type": "ListItem",
                    "position": idx + 1,
                    "url": `https://fineescorts.co.ke/profiles/${p.slug}.html`,
                    "name": p.displayName || p.name
                }))
            }, null, 2)
        };

        res.send(render(template, context));
    } catch (error) {
        console.error('❌ Error serving city page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// ─── Cloudinary + Photo Upload ──────────────────────────────────
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'fineescorts-profiles',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: [{ width: 800, height: 1000, crop: 'limit', quality: 'auto' }]
    }
});


const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/profiles/me/photos', authenticate, upload.array('photos', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No photos uploaded' });
        }
        const profile = await findProfileByUserId(req.userId);
        if (!profile) return res.status(404).json({ message: 'Profile not found' });

        const tier = profile.subscriptionTier || 'free';
        const maxPhotos = { free: 3, standard: 3, premium: 5, vip: 10 }[tier] || 5;
        const existing = profile.photos || [];

        if (existing.length + req.files.length > maxPhotos) {
            return res.status(400).json({
                message: `Maximum ${maxPhotos} photos allowed. You already have ${existing.length}.`
            });
        }

        const photoUrls = req.files.map(f => f.path);
        const updated = await updateProfile(profile.slug, { photos: [...existing, ...photoUrls] });
        res.json({ message: '✅ Photos uploaded successfully', photos: updated.photos });
    } catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({ message: 'Failed to upload photos', error: error.message });
    }
});

app.delete('/api/profiles/me/photos', authenticate, async (req, res) => {
    try {
        const { photoUrl } = req.body;
        if (!photoUrl) return res.status(400).json({ message: 'Photo URL required' });

        const profile = await findProfileByUserId(req.userId);
        if (!profile) return res.status(404).json({ message: 'Profile not found' });

        const updatedPhotos = (profile.photos || []).filter(p => p !== photoUrl);
        const updated = await updateProfile(profile.slug, { photos: updatedPhotos });
        res.json({ message: '✅ Photo deleted successfully', photos: updated.photos });
    } catch (error) {
        console.error('Delete photo error:', error);
        res.status(500).json({ message: 'Failed to delete photo', error: error.message });
    }
});

// ─── ADMIN PHOTO UPLOAD (upload to any profile) ────────────────
app.post('/api/admin/profiles/:slug/photos', authenticate, upload.array('photos', 10), async (req, res) => {
    try {
        const user = await findUserById(req.userId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin access required' });
        }

        const slug = req.params.slug;
        const profile = await findProfileBySlug(slug);
        if (!profile) {
            return res.status(404).json({ message: 'Profile not found' });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No photos uploaded' });
        }

        const existing = profile.photos || profile.images || [];
        const newUrls = req.files.map(f => f.path);

        // Soft guard: max 20 photos per profile (admin override of tier limits)
        if (existing.length + newUrls.length > 20) {
            return res.status(400).json({
                message: `Maximum 20 photos per profile. This profile has ${existing.length}, you tried to add ${newUrls.length}.`
            });
        }

        const allPhotos = [...existing, ...newUrls];

        const updated = await updateProfile(slug, {
            photos: allPhotos,
            images: allPhotos   // keep both in sync
        });

        console.log(`📸 Admin uploaded ${newUrls.length} photo(s) to ${slug}`);

        res.json({
            message: '✅ Photos uploaded',
            photos: updated.photos,
            images: updated.images
        });
    } catch (error) {
        console.error('Admin photo upload error:', error);
        res.status(500).json({ message: 'Failed to upload photos', error: error.message });
    }
});

// ─── Expiry Job ─────────────────────────────────────────────────
async function checkExpiredSubscriptions() {
    try {
        const profilesCol = getCollection('profiles');
        if (!profilesCol) return;

        const expired = await profilesCol.find({
            isApproved: true,
            subscriptionExpiry: { $lt: new Date() }
        }).toArray();

        for (const profile of expired) {
            const user = await findUserById(profile.userId);
            if (!user) continue;
            try {
                await sendSubscriptionExpiredEmail(
                    user.email,
                    profile.displayName || profile.name,
                    profile.subscriptionTier || 'Premium',
                    profile.subscriptionExpiry,
                    'https://fineescorts.co.ke/payment.html'
                );
            } catch (err) {
                console.error('Expiry email failed:', err.message);
            }
            await updateProfile(profile.slug, { isApproved: false, status: 'expired' });
        }
        if (expired.length > 0) {
            console.log(`✅ Processed ${expired.length} expired subscriptions`);
        }
    } catch (error) {
        console.error('❌ Subscription expiry check failed:', error);
    }
}
setInterval(checkExpiredSubscriptions, 24 * 60 * 60 * 1000);

// ─── Start ──────────────────────────────────────────────────────
async function startServer() {
    await connectDB();
    await ensureAdminUser();
    app.listen(PORT, () => {
        console.log(`🚀 FineEscorts Server running at http://localhost:${PORT}`);
        console.log(`📊 API endpoints at http://localhost:${PORT}/api/`);
        console.log(`📁 Database: ${db ? 'MongoDB Atlas ✅' : 'File-based storage ⚠️'}`);
        console.log(`💳 Gateway: Tuma (${process.env.TUMA_API_URL || '⚠️ TUMA_API_URL missing'})`);
    });
}

startServer();