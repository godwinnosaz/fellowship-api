// ============================================================================
// TCCF FELLOWSHIP MANAGER - API SERVER
// ============================================================================
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config();

// Import middlewares and utilities
const { authenticateToken, authorizeRoles, authorizeDepartments, generateToken } = require('./middleware/auth');
const upload = require('./middleware/upload');
const { helmet, generalLimiter, authLimiter } = require('./middleware/security');
const { errorHandler } = require('./middleware/errorHandler');
const { hashPassword, comparePassword, generateOTP, generateResetToken, getResetTokenExpiry } = require('./utils/auth');
const { initializeFirebase, sendPushNotification, sendMulticastNotification } = require('./services/firebase');
const { sendSMS, sendOTP: sendOTPSMS } = require('./services/sms');

// Import modular routes
const createRoutes = require('./routes');

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase for push notifications
initializeFirebase();

// ============================================================================
// SUPER ADMIN BOOTSTRAP
// ============================================================================
async function initializeSuperAdmin() {
    const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const superAdminPassword = process.env.SUPER_ADMIN_PASSWORD;

    if (superAdminEmail && superAdminPassword) {
        try {
            const existing = await prisma.user.findUnique({
                where: { email: superAdminEmail }
            });

            const hashedPassword = await hashPassword(superAdminPassword);

            if (existing) {
                await prisma.user.update({
                    where: { email: superAdminEmail },
                    data: {
                        password: hashedPassword,
                        role: 'SUPER_ADMIN',
                        fellowshipId: null
                    }
                });
                console.log('✅ Super admin updated:', superAdminEmail);
            } else {
                await prisma.user.create({
                    data: {
                        name: 'Super Admin',
                        email: superAdminEmail,
                        password: hashedPassword,
                        role: 'SUPER_ADMIN',
                        fellowshipId: null
                    }
                });
                console.log('✅ Super admin created:', superAdminEmail);
            }
        } catch (error) {
            console.error('❌ Super admin initialization failed:', error.message);
        }
    } else {
        console.log('ℹ️  Super admin credentials not set. Skipping initialization.');
    }
}

// Initialize super admin
initializeSuperAdmin();

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(helmet);
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Apply rate limiting
app.use('/api/login', authLimiter);
app.use('/api/register', authLimiter);
app.use('/api/password', authLimiter);
app.use('/api', generalLimiter);

// ============================================================================
// MOUNT MODULAR ROUTES
// ============================================================================
const middleware = {
    authenticateToken,
    authorizeRoles,
    authorizeDepartments,
    generateToken,
    hashPassword,
    comparePassword,
    generateResetToken,
    getResetTokenExpiry
};

const routes = createRoutes(prisma, middleware);
app.use('/api', routes);

// ============================================================================
// ADDITIONAL ROUTES (Not yet modularized)
// ============================================================================

// Calendar Events
app.get('/api/calendar-events', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const events = await prisma.calendarEvent.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { date: 'asc' }
        });
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch calendar events' });
    }
});

app.post('/api/calendar-events', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { title, date, description, type, fellowshipId } = req.body;
    try {
        const event = await prisma.calendarEvent.create({
            data: {
                title,
                date: new Date(date),
                description,
                type,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(event);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create calendar event' });
    }
});

// Attendance
app.get('/api/attendance', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const attendance = await prisma.attendance.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { date: 'desc' }
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch attendance' });
    }
});

app.post('/api/attendance', authenticateToken, async (req, res) => {
    const { date, menCount, womenCount, childrenCount, serviceType, fellowshipId } = req.body;
    try {
        const total = menCount + womenCount + childrenCount;
        const attendance = await prisma.attendance.create({
            data: {
                date: new Date(date),
                menCount,
                womenCount,
                childrenCount,
                total,
                serviceType,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(attendance);
    } catch (error) {
        res.status(500).json({ error: 'Failed to record attendance' });
    }
});

// Transactions
app.get('/api/transactions', authenticateToken, async (req, res) => {
    const { fellowshipId, type, status } = req.query;
    try {
        const where = { fellowshipId: parseInt(fellowshipId) };
        if (type) where.type = type;
        if (status) where.status = status;

        const transactions = await prisma.transaction.findMany({
            where,
            include: { receipts: true },
            orderBy: { date: 'desc' }
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
    const { type, category, amount, description, fellowshipId } = req.body;
    try {
        const transaction = await prisma.transaction.create({
            data: {
                type,
                category,
                amount: parseFloat(amount),
                description,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});

app.put('/api/transactions/:id/approve', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    try {
        const transaction = await prisma.transaction.update({
            where: { id: parseInt(id) },
            data: {
                status: 'APPROVED',
                approvedBy: req.user.id,
                approvedAt: new Date()
            }
        });
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve transaction' });
    }
});

// Expense Requests
app.get('/api/expense-requests', authenticateToken, async (req, res) => {
    const { fellowshipId, status } = req.query;
    try {
        const where = { fellowshipId: parseInt(fellowshipId) };
        if (status) where.status = status;

        const requests = await prisma.expenseRequest.findMany({
            where,
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch expense requests' });
    }
});

app.post('/api/expense-requests', authenticateToken, async (req, res) => {
    const { title, description, amount, category, fellowshipId } = req.body;
    try {
        const request = await prisma.expenseRequest.create({
            data: {
                title,
                description,
                amount: parseFloat(amount),
                category,
                requestedBy: req.user.name,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(request);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create expense request' });
    }
});

app.put('/api/expense-requests/:id/approve', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'APPROVED' or 'REJECTED'
    try {
        const request = await prisma.expenseRequest.update({
            where: { id: parseInt(id) },
            data: {
                status: status || 'APPROVED',
                approvedBy: req.user.id,
                approvedAt: new Date()
            }
        });
        res.json(request);
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve expense request' });
    }
});

// Budgets
app.get('/api/budgets', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const budgets = await prisma.budget.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { createdAt: 'desc' }
        });
        res.json(budgets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch budgets' });
    }
});

app.post('/api/budgets', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { title, amount, period, department, fellowshipId } = req.body;
    try {
        const budget = await prisma.budget.create({
            data: {
                title,
                amount: parseFloat(amount),
                period,
                department,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(budget);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create budget' });
    }
});

// Media Posts
app.get('/api/media-posts', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const posts = await prisma.mediaPost.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { scheduledDate: 'desc' }
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch media posts' });
    }
});

app.post('/api/media-posts', authenticateToken, async (req, res) => {
    const { platform, content, scheduledDate, fellowshipId } = req.body;
    try {
        const post = await prisma.mediaPost.create({
            data: {
                platform,
                content,
                status: 'Scheduled',
                scheduledDate,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create media post' });
    }
});

// Songs
app.get('/api/songs', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const songs = await prisma.song.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { title: 'asc' }
        });
        res.json(songs);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

app.post('/api/songs', authenticateToken, async (req, res) => {
    const { title, artist, key, link, fellowshipId } = req.body;
    try {
        const song = await prisma.song.create({
            data: {
                title,
                artist,
                key,
                link,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(song);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create song' });
    }
});

// Resources
app.get('/api/resources', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const resources = await prisma.resource.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { title: 'asc' }
        });
        res.json(resources);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch resources' });
    }
});

app.post('/api/resources', authenticateToken, upload.single('file'), async (req, res) => {
    const { title, type, fellowshipId } = req.body;
    try {
        const resource = await prisma.resource.create({
            data: {
                title,
                type,
                url: req.file ? `/uploads/${req.file.filename}` : '',
                size: req.file ? `${(req.file.size / 1024).toFixed(2)} KB` : null,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(resource);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create resource' });
    }
});

// Public Posts
app.get('/api/public-posts', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const posts = await prisma.publicPost.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            include: {
                createdBy: { select: { name: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch public posts' });
    }
});

app.post('/api/public-posts', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { title, content, type, imageUrl, fellowshipId } = req.body;
    try {
        const post = await prisma.publicPost.create({
            data: {
                title,
                content,
                type,
                imageUrl,
                createdById: req.user.id,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create public post' });
    }
});

// Wallet Routes
app.get('/api/wallets', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const wallets = await prisma.unitWallet.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            include: {
                transactions: { take: 5, orderBy: { createdAt: 'desc' } },
                donations: { take: 5, orderBy: { createdAt: 'desc' } }
            }
        });
        res.json(wallets);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch wallets' });
    }
});

app.get('/api/wallets/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const wallet = await prisma.unitWallet.findUnique({
            where: { id: parseInt(id) },
            include: {
                transactions: { orderBy: { createdAt: 'desc' } },
                donations: { orderBy: { createdAt: 'desc' } }
            }
        });
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        res.json(wallet);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

// Dashboard Stats
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const fid = parseInt(fellowshipId);

        const [
            totalMembers,
            pendingTasks,
            upcomingEvents,
            recentTransactions
        ] = await Promise.all([
            prisma.user.count({ where: { fellowshipId: fid } }),
            prisma.task.count({ where: { fellowshipId: fid, status: 'PENDING' } }),
            prisma.event.count({ where: { fellowshipId: fid, status: 'UPCOMING' } }),
            prisma.transaction.findMany({
                where: { fellowshipId: fid },
                take: 5,
                orderBy: { date: 'desc' }
            })
        ]);

        res.json({
            totalMembers,
            pendingTasks,
            upcomingEvents,
            recentTransactions
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================
app.use(errorHandler);

// ============================================================================
// START SERVER
// ============================================================================
app.listen(port, () => {
    console.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║          TCCF Fellowship Manager API Server               ║
    ╠═══════════════════════════════════════════════════════════╣
    ║  Status:  ✅ Running                                      ║
    ║  Port:    ${port}                                            ║
    ║  Mode:    ${process.env.NODE_ENV || 'development'}                                 ║
    ╚═══════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
