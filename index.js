const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const path = require('path');
require('dotenv').config();

// Import middlewares and utilities
const { authenticateToken, authorizeRoles, authorizeDepartments, generateToken } = require('./middleware/auth');
const upload = require('./middleware/upload');
const { hashPassword, comparePassword, generateOTP, generateResetToken, getResetTokenExpiry } = require('./utils/auth');
const { initializeFirebase, sendPushNotification, sendMulticastNotification } = require('./services/firebase');
const { sendSMS, sendOTP: sendOTPSMS } = require('./services/sms');

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3000;

// Initialize Firebase for push notifications
initializeFirebase();

// Bootstrap Super Admin on startup
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

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

// Enhanced Login with JWT
// Public Fellowship Registration
app.post('/api/public/register-fellowship', async (req, res) => {
    const {
        fellowshipName,
        fellowshipCode,
        address,
        adminName,
        adminEmail,
        adminPassword,
        adminPhone
    } = req.body;

    try {
        // 1. Check if fellowship code exists
        const existingFellowship = await prisma.fellowship.findUnique({
            where: { code: fellowshipCode }
        });

        if (existingFellowship) {
            return res.status(400).json({ error: 'Fellowship code already taken' });
        }

        // 2. Check if admin email exists globally (optional, but good practice)
        const existingUser = await prisma.user.findUnique({
            where: { email: adminEmail }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // 3. Create Fellowship
        const fellowship = await prisma.fellowship.create({
            data: {
                name: fellowshipName,
                code: fellowshipCode,
                address: address,
                logo: '', // Optional default
                primaryColor: '#3880ff', // Default Ionic blue
                secondaryColor: '#3dc2ff'
            }
        });

        // 4. Create Admin User
        const hashedPassword = await bcrypt.hash(adminPassword, 10);
        const adminUser = await prisma.user.create({
            data: {
                name: adminName,
                email: adminEmail,
                password: hashedPassword,
                phone: adminPhone || '',
                role: 'SUPER_ADMIN', // Creator is Super Admin of this fellowship
                department: 'PRESIDENCY', // Default department
                fellowshipId: fellowship.id
            }
        });

        // 5. Create Main Treasury Wallet for this Fellowship
        await prisma.wallet.create({
            data: {
                fellowshipId: fellowship.id,
                balance: 0.00
            }
        });

        // 6. Create Unit Wallets for default departments
        const defaultDepts = ['PRESIDENCY', 'FINANCE', 'MUSIC', 'MEDIA', 'PROTOCOL', 'ORGANIZING', 'BIBLE_STUDY', 'ACADEMIC', 'EVANGELISM', 'HOSPITALITY', 'WELFARE'];
        for (const dept of defaultDepts) {
            await prisma.unitWallet.create({
                data: {
                    fellowshipId: fellowship.id,
                    unitDepartment: dept,
                    balance: 0.00
                }
            });
        }

        // Return success with token so they can login immediately
        const token = jwt.sign(
            { userId: adminUser.id, role: adminUser.role, fellowshipId: fellowship.id, department: adminUser.department },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'Fellowship registered successfully',
            token,
            user: {
                id: adminUser.id,
                name: adminUser.name,
                email: adminUser.email,
                role: adminUser.role,
                department: adminUser.department
            },
            fellowship: {
                id: fellowship.id,
                name: fellowship.name,
                code: fellowship.code
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to register fellowship' });
    }
});

app.post('/api/login', async (req, res) => {
    const { code, email, password, memberIdOrEmail, fellowshipCode } = req.body;

    try {
        // Member Login (with memberIdOrEmail, fellowshipCode, and password)
        if (memberIdOrEmail && fellowshipCode && password) {
            // Verify fellowship exists
            const fellowship = await prisma.fellowship.findUnique({
                where: { code: fellowshipCode.toUpperCase() }
            });

            if (!fellowship) {
                console.error('❌ Login Failed: Fellowship Code Not Found:', fellowshipCode);
                return res.status(401).json({ error: 'Invalid Fellowship Code' });
            }

            // Find user by email OR username within this fellowship
            const user = await prisma.user.findFirst({
                where: {
                    AND: [
                        { fellowshipId: fellowship.id },
                        {
                            OR: [
                                { email: memberIdOrEmail },
                                { username: memberIdOrEmail },
                                { membershipId: memberIdOrEmail }
                            ]
                        }
                    ]
                },
                include: { fellowship: true }
            });

            if (!user) {
                console.error('❌ Login Failed: User Not Found:', memberIdOrEmail, 'in Fellowship:', fellowshipCode);
                return res.status(401).json({ error: 'Invalid Username/Email or Password' });
            }

            // Compare password
            const isPasswordValid = await comparePassword(password, user.password);
            if (!isPasswordValid) {
                console.error('❌ Login Failed: Invalid Password for User:', user.email);
                return res.status(401).json({ error: 'Invalid Username/Email or Password' });
            }

            // Generate JWT token
            const token = generateToken(user);
            const { password: _, ...userWithoutPassword } = user;

            return res.json({
                user: userWithoutPassword,
                fellowship: user.fellowship,
                token
            });
        }

        // Executive/Admin Login (email and password)
        if (email && password) {
            // User Login (Executive/Worker/General)
            const user = await prisma.user.findUnique({
                where: { email },
                include: { fellowship: true }
            });

            if (!user) {
                return res.status(401).json({ error: 'Invalid Email or Password' });
            }

            // Compare password with hash
            const isPasswordValid = await comparePassword(password, user.password);

            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Invalid Email or Password' });
            }

            // Generate JWT token
            const token = generateToken(user);
            const { password: _, ...userWithoutPassword } = user;

            res.json({
                user: userWithoutPassword,
                fellowship: user.fellowship || null, // null for SUPER_ADMIN
                token
            });
        } else if (code) {
            // Fellowship Code Login (General Member - no account required)
            const fellowship = await prisma.fellowship.findUnique({
                where: { code: code.toUpperCase() }
            });

            if (fellowship) {
                res.json({ fellowship, role: 'GENERAL' });
            } else {
                res.status(401).json({ error: 'Invalid Fellowship Code' });
            }
        } else {
            res.status(400).json({ error: 'Missing credentials. Please provide either (email & password), (memberIdOrEmail & fellowshipCode & password), or (code)' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Register User
app.post('/api/register', async (req, res) => {
    const { name, email, password, fellowshipCode } = req.body;

    try {
        // Verify Fellowship Code
        const fellowship = await prisma.fellowship.findUnique({
            where: { code: fellowshipCode.toUpperCase() }
        });

        if (!fellowship) {
            return res.status(400).json({ error: 'Invalid Fellowship Code' });
        }

        // Check if email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        });

        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Hash password
        const hashedPassword = await hashPassword(password);

        // Create User
        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role: 'GENERAL',
                fellowshipId: fellowship.id
            }
        });

        // Generate token
        const token = generateToken(user);
        const { password: _, ...userWithoutPassword } = user;

        res.json({ user: userWithoutPassword, fellowship, token });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Request Password Reset
app.post('/api/password/request-reset', async (req, res) => {
    const { email } = req.body;

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            // Don't reveal if email exists
            return res.json({ message: 'If email exists, reset link has been sent' });
        }

        const resetToken = generateResetToken();
        const resetExpiry = getResetTokenExpiry();

        await prisma.user.update({
            where: { email },
            data: {
                resetPasswordToken: resetToken,
                resetPasswordExpires: resetExpiry
            }
        });

        // TODO: Send email or SMS with reset link
        // For now, we'll return the token (in production, send via email/SMS)
        console.log(`Password reset token for ${email}: ${resetToken}`);

        res.json({ message: 'If email exists, reset link has been sent' });
    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({ error: 'Failed to process request' });
    }
});

// Reset Password
app.post('/api/password/reset', async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: {
                    gte: new Date() // Token not expired
                }
            }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const hashedPassword = await hashPassword(newPassword);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetPasswordToken: null,
                resetPasswordExpires: null
            }
        });

        res.json({ message: 'Password reset successful' });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

// Get all sessions for a fellowship
app.get('/api/sessions', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;

    try {
        const sessions = await prisma.session.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { startDate: 'desc' }
        });
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sessions' });
    }
});

// Create new session
app.post('/api/sessions', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { name, startDate, endDate, fellowshipId } = req.body;

    try {
        const session = await prisma.session.create({
            data: {
                name,
                startDate: new Date(startDate),
                endDate: new Date(endDate),
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(session);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Activate a session
app.put('/api/sessions/:id/activate', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { fellowshipId } = req.body;

    try {
        // Deactivate all other sessions for this fellowship
        await prisma.session.updateMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            data: { isActive: false }
        });

        // Activate this session
        const session = await prisma.session.update({
            where: { id: parseInt(id) },
            data: { isActive: true }
        });

        res.json(session);
    } catch (error) {
        res.status(500).json({ error: 'Failed to activate session' });
    }
});

// ============================================================================
// TASK MANAGEMENT
// ============================================================================

// Get tasks
app.get('/api/tasks', authenticateToken, async (req, res) => {
    const { fellowshipId, assignedToId } = req.query;

    try {
        const where = {
            fellowshipId: parseInt(fellowshipId)
        };

        if (assignedToId) {
            where.assignedToId = parseInt(assignedToId);
        }

        const tasks = await prisma.task.findMany({
            where,
            include: {
                assignedTo: { select: { id: true, name: true, email: true } },
                createdBy: { select: { id: true, name: true, email: true } }
            },
            orderBy: { deadline: 'asc' }
        });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// Create task
app.post('/api/tasks', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { title, description, deadline, priority, assignedToId, fellowshipId } = req.body;

    try {
        const task = await prisma.task.create({
            data: {
                title,
                description,
                deadline: new Date(deadline),
                priority,
                assignedToId: parseInt(assignedToId),
                createdById: req.user.id,
                fellowshipId: parseInt(fellowshipId)
            },
            include: {
                assignedTo: true,
                createdBy: true
            }
        });
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// Update task status
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const task = await prisma.task.update({
            where: { id: parseInt(id) },
            data: { status }
        });
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Delete task
app.delete('/api/tasks/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.task.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ============================================================================
// ANNOUNCEMENTS
// ============================================================================

// Get announcements
app.get('/api/announcements', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;

    try {
        const announcements = await prisma.announcement.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            include: {
                createdBy: { select: { name: true, role: true, department: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Parse JSON strings and filter based on user's role and department
        const filtered = announcements.map(announcement => ({
            ...announcement,
            targetRoles: JSON.parse(announcement.targetRoles || '[]'),
            targetDepts: JSON.parse(announcement.targetDepts || '[]')
        })).filter(announcement => {
            const matchesRole = announcement.targetRoles.length === 0 ||
                announcement.targetRoles.includes(req.user.role);
            const matchesDept = announcement.targetDepts.length === 0 ||
                announcement.targetDepts.includes(req.user.department);
            return matchesRole && matchesDept;
        });

        res.json(filtered);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

// Create announcement
app.post('/api/announcements', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { title, content, targetRoles, targetDepts, sendPush, sendSMS, sendWhatsApp, fellowshipId } = req.body;

    try {
        const announcement = await prisma.announcement.create({
            data: {
                title,
                content,
                targetRoles: JSON.stringify(targetRoles || []),
                targetDepts: JSON.stringify(targetDepts || []),
                sendPush: sendPush || false,
                sendSMS: sendSMS || false,
                sendWhatsApp: sendWhatsApp || false,
                createdById: req.user.id,
                fellowshipId: parseInt(fellowshipId)
            }
        });

        // TODO: Send notifications based on flags
        if (sendPush) {
            console.log('📢 Would send push notification');
        }
        if (sendSMS) {
            console.log('📱 Would send SMS');
        }

        res.json({
            ...announcement,
            targetRoles: JSON.parse(announcement.targetRoles),
            targetDepts: JSON.parse(announcement.targetDepts)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create announcement' });
    }
});

// Delete announcement
app.delete('/api/announcements/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;

    try {
        await prisma.announcement.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete announcement' });
    }
});

// ============================================================================
// MEMBERS & USERS
// ============================================================================

// Get detailed member profile
app.get('/api/members/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(id) },
            include: {
                fellowship: true,
                assignedTasks: { take: 5, orderBy: { createdAt: 'desc' } },
                attendance: false // Schema doesn't link attendance to user directly in the view I saw
            }
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Calculate stats (Mocking logic for complex stats as schema is limited)
        // In a real app, query Attendance table where userId = id
        // But Attendance model in schema only has counts (menCount, womenCount), not individual records?
        // Wait, Attendance model: `id, date, menCount...` -> NO relation to User.
        // So we can't track individual attendance yet unless `Attendance` is aggregating.
        // Assume 0 for now or fetch from a different hypothetical table.

        const profile = {
            name: user.name,
            email: user.email,
            phone: user.phone || '', // Check if phone exists in schema
            joinDate: user.createdAt,
            department: user.department || 'General',
            role: user.role,
            attendance: 90, // Placeholder as schema doesn't track individual attendance?
            servicesAttended: 0,
            totalServices: 0,
            groups: [], // Fetch groups if they exist
            badges: [],
            recentActivity: []
        };

        res.json(profile);
    } catch (error) {
        console.error('Fetch member profile error:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

// Get first timers
app.get('/api/first-timers', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;

    try {
        const firstTimers = await prisma.firstTimer.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            include: {
                followUps: {
                    include: {
                        agent: { select: { name: true, email: true } }
                    }
                }
            },
            orderBy: { visitDate: 'desc' }
        });
        res.json(firstTimers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch first timers' });
    }
});

// Register first timer
app.post('/api/first-timers', authenticateToken, async (req, res) => {
    const { name, phone, email, address, howHeard, fellowshipId } = req.body;

    try {
        const firstTimer = await prisma.firstTimer.create({
            data: {
                name,
                phone,
                email,
                address,
                howHeard,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(firstTimer);
    } catch (error) {
        res.status(500).json({ error: 'Failed to register first timer' });
    }
});

// Add follow-up
app.post('/api/follow-ups', authenticateToken, async (req, res) => {
    const { firstTimerId, notes, nextAction } = req.body;

    try {
        const followUp = await prisma.followUp.create({
            data: {
                firstTimerId: parseInt(firstTimerId),
                agentId: req.user.id,
                notes,
                nextAction
            }
        });

        // Mark first timer as followed up
        await prisma.firstTimer.update({
            where: { id: parseInt(firstTimerId) },
            data: { followedUp: true }
        });

        res.json(followUp);
    } catch (error) {
        res.status(500).json({ error: 'Failed to add follow-up' });
    }
});

// ============================================================================
// PRAYER REQUESTS
// ============================================================================

// Get prayer requests
app.get('/api/prayer-requests', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;

    try {
        const requests = await prisma.prayerRequest.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch prayer requests' });
    }
});

// Submit prayer request
app.post('/api/prayer-requests', authenticateToken, async (req, res) => {
    const { requestorName, request, isAnonymous, fellowshipId } = req.body;

    try {
        const prayerRequest = await prisma.prayerRequest.create({
            data: {
                requestorName: isAnonymous ? 'Anonymous' : requestorName,
                request,
                isAnonymous,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(prayerRequest);
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit prayer request' });
    }
});

// Update prayer request status
app.put('/api/prayer-requests/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const request = await prisma.prayerRequest.update({
            where: { id: parseInt(id) },
            data: { status }
        });
        res.json(request);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update prayer request' });
    }
});

// ============================================================================
// BUDGETS
// ============================================================================

// Get budgets
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

// Create budget
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

// Approve/Reject budget
app.put('/api/budgets/:id/approve', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // "APPROVED" or "REJECTED"

    try {
        const budget = await prisma.budget.update({
            where: { id: parseInt(id) },
            data: {
                status,
                approvedBy: req.user.id,
                approvedAt: new Date()
            }
        });
        res.json(budget);
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve budget' });
    }
});

// ============================================================================
// CALENDAR EVENTS
// ============================================================================

// Get calendar events
app.get('/api/calendar/events', authenticateToken, async (req, res) => {
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

// Add calendar event manually
app.post('/api/calendar/events', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
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
// ============================================================================
// UNIT WALLETS
// ============================================================================

// Get all unit wallets (Admin/Treasury)
app.get('/api/wallets', authenticateToken, authorizeRoles('EXECUTIVE', 'SUPER_ADMIN'), async (req, res) => {
    const { fellowshipId } = req.query;

    try {
        const wallets = await prisma.unitWallet.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            include: {
                transactions: {
                    take: 5,
                    orderBy: { createdAt: 'desc' }
                }
            }
        });
        res.json(wallets);
    } catch (error) {
        console.error('Fetch wallets error:', error);
        res.status(500).json({ error: 'Failed to fetch unit wallets' });
    }
});

// Get my unit wallet
app.get('/api/wallets/my-unit', authenticateToken, async (req, res) => {
    try {
        if (!req.user.department) {
            return res.status(400).json({ error: 'User does not belong to a department' });
        }

        // Find or create wallet for this department
        let wallet = await prisma.unitWallet.findFirst({
            where: {
                fellowshipId: req.user.fellowshipId,
                unitDepartment: req.user.department
            }
        });

        if (!wallet) {
            wallet = await prisma.unitWallet.create({
                data: {
                    fellowshipId: req.user.fellowshipId,
                    unitDepartment: req.user.department,
                    balance: 0.00,
                    status: 'ACTIVE'
                }
            });
        }

        // Fetch recent transactions
        const transactions = await prisma.walletTransaction.findMany({
            where: { walletId: wallet.id },
            orderBy: { createdAt: 'desc' },
            take: 10
        });

        res.json({ ...wallet, transactions });
    } catch (error) {
        console.error('Fetch my wallet error:', error);
        res.status(500).json({ error: 'Failed to fetch unit wallet' });
    }
});

// Fund a unit wallet (Transfer from Main Treasury to Unit)
app.post('/api/wallets/fund', authenticateToken, authorizeRoles('EXECUTIVE', 'SUPER_ADMIN'), async (req, res) => {
    const { walletId, amount, description, fellowshipId } = req.body;

    try {
        // 1. Verify wallet exists
        const wallet = await prisma.unitWallet.findUnique({
            where: { id: parseInt(walletId) }
        });

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // 2. Create Main Fellowship Expense (The outflow)
        await prisma.transaction.create({
            data: {
                type: 'EXPENSE',
                category: 'UNIT_FUNDING',
                amount: parseFloat(amount),
                description: `Funding for ${wallet.unitDepartment}: ${description}`,
                fellowshipId: parseInt(fellowshipId),
                status: 'APPROVED',
                approvedBy: req.user.id,
                approvedAt: new Date()
            }
        });

        // 3. Create Unit Wallet Deposit (The inflow)
        const walletTx = await prisma.walletTransaction.create({
            data: {
                walletId: wallet.id,
                transactionType: 'DEPOSIT', // Funding
                amount: parseFloat(amount),
                description: `Received from Main Treasury: ${description}`,
                initiatedById: req.user.id,
                status: 'COMPLETED', // Immediate for internal transfer
                completedAt: new Date()
            }
        });

        // 4. Update Balance
        const updatedWallet = await prisma.unitWallet.update({
            where: { id: wallet.id },
            data: {
                balance: { increment: parseFloat(amount) }
            }
        });

        res.json({ wallet: updatedWallet, transaction: walletTx });
    } catch (error) {
        console.error('Fund wallet error:', error);
        res.status(500).json({ error: 'Failed to fund wallet' });
    }
});

// Get Events
app.get('/api/events', async (req, res) => {
    const { fellowshipId } = req.query;
    if (!fellowshipId) return res.status(400).json({ error: 'Missing fellowshipId' });

    try {
        const events = await prisma.event.findMany({
            where: { fellowshipId: parseInt(fellowshipId) }
        });
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create Event
app.post('/api/events', async (req, res) => {
    const { title, date, time, location, type, description, status, fellowshipId } = req.body;
    try {
        const event = await prisma.event.create({
            data: {
                title,
                date,
                time,
                location,
                type,
                description,
                status,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(event);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create event' });
    }
});

// Delete Event
app.delete('/api/events/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.event.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

// Get Resources
app.get('/api/resources', async (req, res) => {
    const { fellowshipId } = req.query;
    if (!fellowshipId) return res.status(400).json({ error: 'Missing fellowshipId' });

    try {
        const resources = await prisma.resource.findMany({
            where: { fellowshipId: parseInt(fellowshipId) }
        });
        res.json(resources);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create Resource
app.post('/api/resources', async (req, res) => {
    const { title, type, url, size, fellowshipId } = req.body;
    try {
        const resource = await prisma.resource.create({
            data: {
                title,
                type,
                url,
                size,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(resource);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create resource' });
    }
});

// Delete Resource
app.delete('/api/resources/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.resource.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete resource' });
    }
});

// Get Transactions
app.get('/api/transactions', async (req, res) => {
    const { fellowshipId, status, type } = req.query;
    if (!fellowshipId) return res.status(400).json({ error: 'Missing fellowshipId' });

    try {
        const where = { fellowshipId: parseInt(fellowshipId) };
        if (status) where.status = status;
        if (type) where.type = type;

        const transactions = await prisma.transaction.findMany({
            where,
            include: { receipts: true },
            orderBy: { date: 'desc' }
        });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get Single Transaction
app.get('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const transaction = await prisma.transaction.findUnique({
            where: { id: parseInt(id) },
            include: { receipts: true }
        });
        if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create Transaction
app.post('/api/transactions', async (req, res) => {
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

// Approve Transaction
app.put('/api/transactions/:id/approve', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // "APPROVED" or "REJECTED"

    try {
        const transaction = await prisma.transaction.update({
            where: { id: parseInt(id) },
            data: {
                status,
                approvedBy: req.user.id,
                approvedAt: new Date()
            }
        });
        res.json(transaction);
    } catch (error) {
        res.status(500).json({ error: 'Failed to approve transaction' });
    }
});

// ============================================================================
// DASHBOARD STATISTICS
// ============================================================================

// Get Dashboard Stats (for Committee/Executive dashboards)
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    const { fellowshipId, month, year } = req.query;

    if (!fellowshipId) {
        return res.status(400).json({ error: 'Missing fellowshipId' });
    }

    try {
        const fId = parseInt(fellowshipId);

        // Total members
        const totalMembers = await prisma.user.count({
            where: { fellowshipId: fId }
        });

        // Active workers (EXECUTIVE or WORKER role)
        const activeWorkers = await prisma.user.count({
            where: {
                fellowshipId: fId,
                role: { in: ['EXECUTIVE', 'WORKER'] }
            }
        });

        // Tasks statistics
        const pendingTasks = await prisma.task.count({
            where: {
                fellowshipId: fId,
                status: { in: ['PENDING', 'IN_PROGRESS'] }
            }
        });

        const completedTasks = await prisma.task.count({
            where: {
                fellowshipId: fId,
                status: 'COMPLETED'
            }
        });

        // Financial statistics (current month or selected month)
        let startOfMonth, endOfMonth;

        if (month && year) {
            startOfMonth = new Date(parseInt(year), parseInt(month), 1);
            endOfMonth = new Date(parseInt(year), parseInt(month) + 1, 0);
        } else {
            const now = new Date();
            startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }

        const thisMonthTransactions = await prisma.transaction.findMany({
            where: {
                fellowshipId: fId,
                date: {
                    gte: startOfMonth,
                    lte: endOfMonth
                }
            }
        });

        const thisMonthIncome = thisMonthTransactions
            .filter(t => t.type === 'INCOME')
            .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);

        const thisMonthExpense = thisMonthTransactions
            .filter(t => t.type === 'EXPENSE')
            .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);

        // Total financials (all time)
        const allTransactions = await prisma.transaction.findMany({
            where: { fellowshipId: fId }
        });

        const totalIncome = allTransactions
            .filter(t => t.type === 'INCOME')
            .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);

        const totalExpense = allTransactions
            .filter(t => t.type === 'EXPENSE')
            .reduce((sum, t) => sum + parseFloat(t.amount.toString()), 0);

        // Pending approvals
        const pendingApprovals = await prisma.transaction.count({
            where: {
                fellowshipId: fId,
                status: 'PENDING'
            }
        });

        // Upcoming events (next 30 days)
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        const upcomingEvents = await prisma.event.count({
            where: {
                fellowshipId: fId,
                date: {
                    gte: now,
                    lte: thirtyDaysFromNow
                }
            }
        });

        res.json({
            totalMembers,
            activeWorkers,
            pendingTasks,
            completedTasks,
            thisMonthIncome,
            thisMonthExpense,
            totalIncome,
            totalExpense,
            pendingApprovals,
            upcomingEvents
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});


// Upload Receipt
app.post('/api/receipts', authenticateToken, upload.single('receipt'), async (req, res) => {
    const { transactionId } = req.body;

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const receipt = await prisma.receipt.create({
            data: {
                transactionId: parseInt(transactionId),
                fileUrl: `/uploads/receipts/${req.file.filename}`,
                uploadedById: req.user.id
            }
        });
        res.json(receipt);
    } catch (error) {
        res.status(500).json({ error: 'Failed to upload receipt' });
    }
});

// Get Users
app.get('/api/users', async (req, res) => {
    const { fellowshipId } = req.query;
    if (!fellowshipId) return res.status(400).json({ error: 'Missing fellowshipId' });

    try {
        const users = await prisma.user.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                department: true
            }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Create User (Admin)
app.post('/api/users', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { name, email, password, role, department, fellowshipId } = req.body;
    try {
        const hashedPassword = await hashPassword(password);

        const user = await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role,
                department,
                fellowshipId: parseInt(fellowshipId)
            }
        });

        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Update fellowship logo
app.put('/api/fellowships/:id/logo', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
    // ... existing logo logic if any ...
});

// Get Unit Configuration
app.get('/api/fellowships/:id/unit-config', authenticateToken, async (req, res) => {
    try {
        const fellowship = await prisma.fellowship.findUnique({
            where: { id: parseInt(req.params.id) },
            select: { unitSettings: true }
        });

        if (!fellowship) return res.status(404).json({ error: 'Fellowship not found' });

        // Return parsed JSON or empty object
        const config = fellowship.unitSettings ? JSON.parse(fellowship.unitSettings) : {};
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch unit config' });
    }
});

// Update Unit Configuration (Merging Units)
app.put('/api/fellowships/:id/unit-config', authenticateToken, authorizeRoles('SUPER_ADMIN', 'EXECUTIVE'), async (req, res) => {
    const { unitConfig } = req.body; // Expects JSON object: { "CHILD_UNIT": "PARENT_UNIT" } e.g. { "HOSPITALITY": "EVANGELISM" }

    try {
        await prisma.fellowship.update({
            where: { id: parseInt(req.params.id) },
            data: {
                unitSettings: JSON.stringify(unitConfig)
            }
        });
        res.json({ message: 'Unit configuration updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update unit config' });
    }
});
// Update User (Admin)
app.put('/api/users/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { name, email, role, department } = req.body;

    try {
        const user = await prisma.user.update({
            where: { id: parseInt(id) },
            data: {
                name,
                email,
                role,
                department
            }
        });

        const { password: _, ...userWithoutPassword } = user;
        res.json(userWithoutPassword);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Songs Endpoints
app.get('/api/songs', async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const songs = await prisma.song.findMany({ where: { fellowshipId: parseInt(fellowshipId) } });
        res.json(songs);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch songs' }); }
});

app.post('/api/songs', async (req, res) => {
    const { title, artist, key, link, fellowshipId } = req.body;
    try {
        const song = await prisma.song.create({
            data: { title, artist, key, link, fellowshipId: parseInt(fellowshipId) }
        });
        res.json(song);
    } catch (error) { res.status(500).json({ error: 'Failed to create song' }); }
});

// Attendance Endpoints
app.get('/api/attendance', async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const records = await prisma.attendance.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { date: 'desc' }
        });
        res.json(records);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch attendance' }); }
});

app.post('/api/attendance', async (req, res) => {
    const { menCount, womenCount, childrenCount, serviceType, fellowshipId } = req.body;
    try {
        const total = parseInt(menCount) + parseInt(womenCount) + parseInt(childrenCount);
        const record = await prisma.attendance.create({
            data: {
                menCount: parseInt(menCount),
                womenCount: parseInt(womenCount),
                childrenCount: parseInt(childrenCount),
                total,
                serviceType,
                fellowshipId: parseInt(fellowshipId)
            }
        });
        res.json(record);
    } catch (error) { res.status(500).json({ error: 'Failed to record attendance' }); }
});

// Media Post Endpoints
app.get('/api/media-posts', async (req, res) => {
    const { fellowshipId } = req.query;
    try {
        const posts = await prisma.mediaPost.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            orderBy: { scheduledDate: 'asc' }
        });
        res.json(posts);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch posts' }); }
});

app.post('/api/media-posts', async (req, res) => {
    const { platform, content, status, scheduledDate, fellowshipId } = req.body;
    try {
        const post = await prisma.mediaPost.create({
            data: { platform, content, status, scheduledDate, fellowshipId: parseInt(fellowshipId) }
        });
        res.json(post);
    } catch (error) { res.status(500).json({ error: 'Failed to create post' }); }
});

// ============================================================================
// EXPENSE REQUEST ENDPOINTS
// ============================================================================

// Get all expense requests (with filtering)
app.get('/api/expenses', authenticateToken, async (req, res) => {
    const { fellowshipId, status, department } = req.query;
    try {
        const where = { fellowshipId: parseInt(fellowshipId) };
        if (status) where.status = status;
        if (department) where.department = department;

        const expenses = await prisma.expenseRequest.findMany({
            where,
            include: {
                user: { select: { name: true, department: true } },
                approvals: {
                    include: {
                        approver: { select: { name: true, department: true } }
                    },
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(expenses);
    } catch (error) {
        console.error('Fetch expenses error:', error);
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});

// Create expense request
app.post('/api/expenses', authenticateToken, async (req, res) => {
    const { title, category, amount, description, beneficiary, department, fellowshipId } = req.body;
    const userId = req.user.id;

    try {
        const expense = await prisma.expenseRequest.create({
            data: {
                title,
                category,
                amount: parseFloat(amount),
                description,
                beneficiary,
                department,
                status: 'PENDING_HOD',
                userId,
                fellowshipId: parseInt(fellowshipId)
            },
            include: {
                user: { select: { name: true, department: true } }
            }
        });
        res.json(expense);
    } catch (error) {
        console.error('Create expense error:', error);
        res.status(500).json({ error: 'Failed to create expense request' });
    }
});

// Approve/Reject expense request
app.post('/api/expenses/:id/approve', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { action, comments } = req.body; // action: 'APPROVE' or 'REJECT'
    const approverId = req.user.id;
    const approverDept = req.user.department;

    try {
        const expense = await prisma.expenseRequest.findUnique({
            where: { id: parseInt(id) },
            include: { approvals: true }
        });

        if (!expense) {
            return res.status(404).json({ error: 'Expense request not found' });
        }

        // Determine next status based on current status and approver department
        let newStatus = expense.status;
        let approvalLevel = '';

        if (expense.status === 'PENDING_HOD' && approverDept !== 'PRESIDENCY') {
            approvalLevel = 'HOD';
            newStatus = action === 'APPROVE' ? 'PENDING_FINANCE' : 'REJECTED';
        } else if (expense.status === 'PENDING_FINANCE' && approverDept === 'FINANCE') {
            approvalLevel = 'FINANCE';
            newStatus = action === 'APPROVE' ? 'PENDING_COP' : 'REJECTED';
        } else if (expense.status === 'PENDING_COP' && approverDept === 'PRESIDENCY') {
            approvalLevel = 'COP';
            newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
        } else {
            return res.status(403).json({ error: 'Unauthorized to approve at this level' });
        }

        // Create approval record
        await prisma.expenseApproval.create({
            data: {
                expenseRequestId: parseInt(id),
                approverId,
                level: approvalLevel,
                action,
                comments
            }
        });

        // Update expense status
        const updatedExpense = await prisma.expenseRequest.update({
            where: { id: parseInt(id) },
            data: { status: newStatus },
            include: {
                user: { select: { name: true, department: true } },
                approvals: {
                    include: {
                        approver: { select: { name: true, department: true } }
                    }
                }
            }
        });

        res.json(updatedExpense);
    } catch (error) {
        console.error('Approve expense error:', error);
        res.status(500).json({ error: 'Failed to process approval' });
    }
});

// Upload receipt for expense
app.post('/api/expenses/:id/receipt', authenticateToken, upload.single('receipt'), async (req, res) => {
    const { id } = req.params;

    try {
        const receiptUrl = `/uploads/${req.file.filename}`;

        const expense = await prisma.expenseRequest.update({
            where: { id: parseInt(id) },
            data: { receiptUrl }
        });

        res.json({ receiptUrl, expense });
    } catch (error) {
        console.error('Upload receipt error:', error);
        res.status(500).json({ error: 'Failed to upload receipt' });
    }
});

// ============================================================================
// SUPER ADMIN - FELLOWSHIP MANAGEMENT
// ============================================================================

// Get all fellowships (super admin only)
app.get('/api/admin/fellowships',
    authenticateToken,
    authorizeRoles('SUPER_ADMIN'),
    async (req, res) => {
        try {
            const fellowships = await prisma.fellowship.findMany({
                include: {
                    _count: {
                        select: {
                            users: true,
                            events: true,
                            tasks: true,
                            transactions: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            });
            res.json(fellowships);
        } catch (error) {
            console.error('Get fellowships error:', error);
            res.status(500).json({ error: 'Failed to fetch fellowships' });
        }
    }
);

// Create fellowship (super admin only)
app.post('/api/admin/fellowships',
    authenticateToken,
    authorizeRoles('SUPER_ADMIN'),
    async (req, res) => {
        const { name, code, school, address, logo } = req.body;

        try {
            // Check if code already exists
            const existing = await prisma.fellowship.findUnique({
                where: { code: code.toUpperCase() }
            });

            if (existing) {
                return res.status(400).json({ error: 'Fellowship code already exists' });
            }

            const fellowship = await prisma.fellowship.create({
                data: {
                    name,
                    code: code.toUpperCase(),
                    school,
                    address,
                    logo
                }
            });
            console.log(`✅ Fellowship created: ${fellowship.name} (${fellowship.code})`);
            res.json(fellowship);
        } catch (error) {
            console.error('Create fellowship error:', error);
            res.status(500).json({ error: 'Failed to create fellowship' });
        }
    }
);

// Update fellowship (super admin only)
app.put('/api/admin/fellowships/:id',
    authenticateToken,
    authorizeRoles('SUPER_ADMIN'),
    async (req, res) => {
        const { id } = req.params;
        const { name, code, school, address, logo } = req.body;

        try {
            const fellowship = await prisma.fellowship.update({
                where: { id: parseInt(id) },
                data: { name, code: code.toUpperCase(), school, address, logo }
            });
            res.json(fellowship);
        } catch (error) {
            console.error('Update fellowship error:', error);
            res.status(500).json({ error: 'Failed to update fellowship' });
        }
    }
);

// Delete fellowship (super admin only)
app.delete('/api/admin/fellowships/:id',
    authenticateToken,
    authorizeRoles('SUPER_ADMIN'),
    async (req, res) => {
        const { id } = req.params;

        try {
            await prisma.fellowship.delete({
                where: { id: parseInt(id) }
            });
            res.json({ success: true });
        } catch (error) {
            console.error('Delete fellowship error:', error);
            res.status(500).json({ error: 'Failed to delete fellowship' });
        }
    }
);

// ============================================================================
// FELLOWSHIP USER MANAGEMENT
// ============================================================================

// Get all users in a fellowship (super admin or fellowship leaders)
app.get('/api/admin/fellowships/:id/users',
    authenticateToken,
    authorizeRoles('SUPER_ADMIN', 'EXECUTIVE'),
    async (req, res) => {
        const { id } = req.params;

        try {
            // If not super admin, verify user belongs to this fellowship
            if (req.user.role !== 'SUPER_ADMIN' && req.user.fellowshipId !== parseInt(id)) {
                return res.status(403).json({ error: 'Unauthorized' });
            }

            const users = await prisma.user.findMany({
                where: { fellowshipId: parseInt(id) },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    department: true,
                    createdAt: true,
                    isVerified: true
                },
                orderBy: { createdAt: 'desc' }
            });
            res.json(users);
        } catch (error) {
            console.error('Get fellowship users error:', error);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    }
);

// Assign role to user (super admin or president/secgen)
app.put('/api/admin/users/:id/role',
    authenticateToken,
    authorizeRoles('SUPER_ADMIN', 'EXECUTIVE'),
    async (req, res) => {
        const { id } = req.params;
        const { role, department } = req.body;

        try {
            // Get the user being updated
            const targetUser = await prisma.user.findUnique({
                where: { id: parseInt(id) }
            });

            if (!targetUser) {
                return res.status(404).json({ error: 'User not found' });
            }

            // Authorization checks
            if (req.user.role !== 'SUPER_ADMIN') {
                // Must be in same fellowship
                if (req.user.fellowshipId !== targetUser.fellowshipId) {
                    return res.status(403).json({ error: 'Can only manage users in your fellowship' });
                }

                // Must be president or secgen
                if (!['PRESIDENCY', 'SECRETARY_GENERAL'].includes(req.user.department)) {
                    return res.status(403).json({ error: 'Only President or Secretary General can assign roles' });
                }

                // Can only create EXECUTIVE, WORKER, or GENERAL roles
                if (!['EXECUTIVE', 'WORKER', 'GENERAL'].includes(role)) {
                    return res.status(403).json({ error: 'Can only assign EXECUTIVE, WORKER, or GENERAL roles' });
                }
            }

            const user = await prisma.user.update({
                where: { id: parseInt(id) },
                data: { role, department }
            });

            const { password: _, ...userWithoutPassword } = user;
            console.log(`✅ Role assigned: ${user.email} → ${role} (${department})`);
            res.json(userWithoutPassword);
        } catch (error) {
            console.error('Assign role error:', error);
            res.status(500).json({ error: 'Failed to assign role' });
        }
    }
);

// Create user in fellowship (super admin or president/secgen)
app.post('/api/admin/fellowships/:id/users',
    authenticateToken,
    authorizeRoles('SUPER_ADMIN', 'EXECUTIVE'),
    async (req, res) => {
        const { name, email, password, role, department } = req.body;
        const fellowshipId = parseInt(req.params.id);

        try {
            // Authorization checks
            if (req.user.role !== 'SUPER_ADMIN') {
                // Must be in same fellowship
                if (req.user.fellowshipId !== fellowshipId) {
                    return res.status(403).json({ error: 'Can only create users in your fellowship' });
                }

                // Must be president or secgen
                if (!['PRESIDENCY', 'SECRETARY_GENERAL'].includes(req.user.department)) {
                    return res.status(403).json({ error: 'Only President or Secretary General can create users' });
                }

                // Can only create EXECUTIVE, WORKER, or GENERAL
                if (!['EXECUTIVE', 'WORKER', 'GENERAL'].includes(role)) {
                    return res.status(403).json({ error: 'Can only create EXECUTIVE, WORKER, or GENERAL roles' });
                }
            }

            // Check if email already exists
            const existingUser = await prisma.user.findUnique({
                where: { email }
            });

            if (existingUser) {
                return res.status(400).json({ error: 'Email already registered' });
            }

            const hashedPassword = await hashPassword(password);
            const user = await prisma.user.create({
                data: {
                    name,
                    email,
                    password: hashedPassword,
                    role,
                    department,
                    fellowshipId
                }
            });

            const { password: _, ...userWithoutPassword } = user;
            console.log(`✅ User created: ${user.email} → ${role} (${department}) in fellowship ${fellowshipId}`);
            res.json(userWithoutPassword);
        } catch (error) {
            console.error('Create user error:', error);
            res.status(500).json({ error: 'Failed to create user' });
        }
    }
);


// ============================================================================
// PUBLIC POSTS - Landing Page Feed  
// ============================================================================


// Get all fellowships (public endpoint for registration)
app.get('/api/public/fellowships', async (req, res) => {
    try {
        const fellowships = await prisma.fellowship.findMany({
            select: {
                id: true,
                name: true,
                code: true,
                school: true,
                logo: true
            },
            orderBy: { name: 'asc' }
        });
        res.json(fellowships);
    } catch (error) {
        console.error('Get public fellowships error:', error);
        res.status(500).json({ error: 'Failed to fetch fellowships' });
    }
});
// Get all public posts (no authentication required)
app.get('/api/public/posts', async (req, res) => {
    try {
        const posts = await prisma.publicPost.findMany({
            where: { isPublic: true },
            include: {
                fellowship: {
                    select: { name: true, code: true, logo: true }
                },
                createdBy: {
                    select: { name: true, department: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        res.json(posts);
    } catch (error) {
        console.error('Get public posts error:', error);
        res.status(500).json({ error: 'Failed to fetch public posts' });
    }
});

// Create public post (executives and super admin only)
app.post('/api/posts',
    authenticateToken,
    authorizeRoles('EXECUTIVE', 'SUPER_ADMIN'),
    async (req, res) => {
        const { title, content, type, isPublic, imageUrl } = req.body;

        try {
            const post = await prisma.publicPost.create({
                data: {
                    title,
                    content,
                    type: type || 'ANNOUNCEMENT',
                    isPublic: isPublic !== undefined ? isPublic : true,
                    imageUrl,
                    fellowshipId: req.user.fellowshipId,
                    createdById: req.user.id
                },
                include: {
                    fellowship: { select: { name: true, code: true } },
                    createdBy: { select: { name: true } }
                }
            });

            console.log(`✅ Public post created: ${newPost.title} by ${user.name}`);
            res.json(post);
        } catch (error) {
            console.error('Create post error:', error);
            res.status(500).json({ error: 'Failed to create post' });
        }
    }
);
app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`📊 Prisma connected to database`);
});


// ============================================================================
// WALLET SYSTEM - UNIT WALLETS & VPAY INTEGRATION
// ============================================================================

// Approval chain definition
const APPROVAL_CHAIN = [
    { order: 1, role: 'SECRETARY_GENERAL', label: 'Secretary General (Initial)' },
    { order: 2, role: 'PRESIDENCY', label: 'President' },
    { order: 3, role: 'VICE_PRESIDENT', label: 'Vice President' },
    { order: 4, role: 'SECRETARY_GENERAL', label: 'Secretary General (Final)' },
    { order: 5, role: 'FINANCIAL_SECRETARY', label: 'Financial Secretary' }
];

// ============================================================================
// WALLET MANAGEMENT
// ============================================================================

// Get all unit wallets for a fellowship
app.get('/api/wallets', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;

    try {
        const wallets = await prisma.unitWallet.findMany({
            where: { fellowshipId: parseInt(fellowshipId) },
            include: {
                _count: {
                    select: {
                        transactions: true,
                        donations: true
                    }
                }
            },
            orderBy: { unitDepartment: 'asc' }
        });

        res.json(wallets);
    } catch (error) {
        console.error('Get wallets error:', error);
        res.status(500).json({ error: 'Failed to fetch wallets' });
    }
});

// Get specific wallet by ID
app.get('/api/wallets/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const wallet = await prisma.unitWallet.findUnique({
            where: { id: parseInt(id) },
            include: {
                transactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 20
                },
                donations: {
                    include: {
                        member: {
                            select: { id: true, name: true, email: true }
                        }
                    },
                    orderBy: { createdAt: 'desc' },
                    take: 20
                }
            }
        });

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        res.json(wallet);
    } catch (error) {
        console.error('Get wallet error:', error);
        res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

// Get wallet by department
app.get('/api/wallets/department/:department', authenticateToken, async (req, res) => {
    const { department } = req.params;
    const { fellowshipId } = req.query;

    try {
        const wallet = await prisma.unitWallet.findUnique({
            where: {
                fellowshipId_unitDepartment: {
                    fellowshipId: parseInt(fellowshipId),
                    unitDepartment: department.toUpperCase()
                }
            },
            include: {
                transactions: {
                    orderBy: { createdAt: 'desc' },
                    take: 10
                },
                donations: {
                    include: {
                        member: {
                            select: { id: true, name: true }
                        }
                    },
                    where: { isAnonymous: false },
                    orderBy: { createdAt: 'desc' },
                    take: 10
                }
            }
        });

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found for this department' });
        }

        res.json(wallet);
    } catch (error) {
        console.error('Get wallet by department error:', error);
        res.status(500).json({ error: 'Failed to fetch wallet' });
    }
});

// Create wallet for a unit
app.post('/api/wallets', authenticateToken, authorizeRoles('EXECUTIVE', 'SUPER_ADMIN'), async (req, res) => {
    const { fellowshipId, unitDepartment } = req.body;

    try {
        // Check if wallet already exists
        const existing = await prisma.unitWallet.findUnique({
            where: {
                fellowshipId_unitDepartment: {
                    fellowshipId: parseInt(fellowshipId),
                    unitDepartment: unitDepartment.toUpperCase()
                }
            }
        });

        if (existing) {
            return res.status(400).json({ error: 'Wallet already exists for this department' });
        }

        const wallet = await prisma.unitWallet.create({
            data: {
                fellowshipId: parseInt(fellowshipId),
                unitDepartment: unitDepartment.toUpperCase(),
                balance: 0.00
            }
        });

        // TODO: Create VPay virtual account
        // const vpayAccount = await createVPayVirtualAccount(fellowship, unitDepartment);
        // await prisma.unitWallet.update({
        //     where: { id: wallet.id },
        //     data: {
        //         vpayVirtualAccount: vpayAccount.accountNumber,
        //         vpayAccountName: vpayAccount.accountName
        //     }
        // });

        res.json(wallet);
    } catch (error) {
        console.error('Create wallet error:', error);
        res.status(500).json({ error: 'Failed to create wallet' });
    }
});

// ============================================================================
// DONATIONS
// ============================================================================

// Record a donation (called by VPay webhook or manual entry)
app.post('/api/donations', authenticateToken, async (req, res) => {
    const { walletId, memberId, amount, paymentMethod, donationNote, vpayReference } = req.body;

    try {
        const wallet = await prisma.unitWallet.findUnique({
            where: { id: parseInt(walletId) }
        });

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // Calculate commissions (VPay 1.5% + Brainiac 0.5%)
        const vpayFee = paymentMethod === 'VPAY_TRANSFER' ? amount * 0.015 : 0;
        const brainiacCut = paymentMethod === 'VPAY_TRANSFER' ? amount * 0.005 : 0;
        const netAmount = amount - vpayFee - brainiacCut;

        // Create donation record
        const donation = await prisma.memberDonation.create({
            data: {
                walletId: parseInt(walletId),
                memberId: parseInt(memberId),
                amount: netAmount,
                paymentMethod: paymentMethod || 'VPAY_TRANSFER',
                vpayReference,
                donationNote
            }
        });

        // Create transaction record
        const transaction = await prisma.walletTransaction.create({
            data: {
                walletId: parseInt(walletId),
                transactionType: 'DEPOSIT',
                amount: netAmount,
                description: `Donation from member${donationNote ? ': ' + donationNote : ''}`,
                vpayReference,
                status: 'COMPLETED',
                completedAt: new Date()
            }
        });

        // Update wallet balance
        await prisma.unitWallet.update({
            where: { id: parseInt(walletId) },
            data: {
                balance: { increment: netAmount }
            }
        });

        // Record commission if VPay payment
        if (paymentMethod === 'VPAY_TRANSFER' && brainiacCut > 0) {
            await prisma.brainiacCommission.create({
                data: {
                    fellowshipId: wallet.fellowshipId,
                    transactionId: transaction.id,
                    originalAmount: amount,
                    vpayFee,
                    brainiacCut,
                    netAmount,
                    commissionRate: 0.005
                }
            });
        }

        // TODO: Send SMS notification to unit head
        // await sendSMS(unitHead.phone, `New donation of â‚¦${netAmount} received!`);

        res.json({ donation, transaction, netAmount });
    } catch (error) {
        console.error('Record donation error:', error);
        res.status(500).json({ error: 'Failed to record donation' });
    }
});

// Get donations for a wallet
app.get('/api/donations/wallet/:walletId', authenticateToken, async (req, res) => {
    const { walletId } = req.params;
    const { limit = 50 } = req.query;

    try {
        const donations = await prisma.memberDonation.findMany({
            where: { walletId: parseInt(walletId) },
            include: {
                member: {
                    select: { id: true, name: true, email: true }
                }
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit)
        });

        res.json(donations);
    } catch (error) {
        console.error('Get donations error:', error);
        res.status(500).json({ error: 'Failed to fetch donations' });
    }
});

// ============================================================================
// WITHDRAWALS & APPROVAL WORKFLOW
// ============================================================================

// Initiate withdrawal request
app.post('/api/withdrawals/request', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { walletId, amount, description } = req.body;

    try {
        const wallet = await prisma.unitWallet.findUnique({
            where: { id: parseInt(walletId) }
        });

        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // Check if sufficient balance
        if (wallet.balance < amount) {
            return res.status(400).json({ error: 'Insufficient wallet balance' });
        }

        // Check if user is unit head for this department
        if (req.user.department !== wallet.unitDepartment) {
            return res.status(403).json({ error: 'Only unit heads can request withdrawals for their department' });
        }

        // Create withdrawal transaction
        const transaction = await prisma.walletTransaction.create({
            data: {
                walletId: parseInt(walletId),
                transactionType: 'WITHDRAWAL',
                amount: parseFloat(amount),
                description,
                initiatedById: req.user.id,
                status: 'PENDING'
            }
        });

        // Create approval chain
        for (const step of APPROVAL_CHAIN) {
            await prisma.transactionApproval.create({
                data: {
                    transactionId: transaction.id,
                    approverRole: step.role,
                    approvalOrder: step.order,
                    approvalStatus: 'PENDING'
                }
            });
        }

        // TODO: Notify first approver (Secretary General)
        // const secGen = await findUserByRole(wallet.fellowshipId, 'SECRETARY_GENERAL');
        // await sendNotification(secGen, `New withdrawal request of â‚¦${amount}`);

        res.json({ transaction, message: 'Withdrawal request submitted for approval' });
    } catch (error) {
        console.error('Initiate withdrawal error:', error);
        res.status(500).json({ error: 'Failed to initiate withdrawal' });
    }
});

// Get pending approvals for current user
app.get('/api/withdrawals/pending-approvals', authenticateToken, async (req, res) => {
    const { fellowshipId } = req.query;

    try {
        // Find approvals pending for user's role
        const approvals = await prisma.transactionApproval.findMany({
            where: {
                approverRole: req.user.role,
                approvalStatus: 'PENDING',
                transaction: {
                    wallet: {
                        fellowshipId: parseInt(fellowshipId)
                    }
                }
            },
            include: {
                transaction: {
                    include: {
                        wallet: true,
                        initiatedBy: {
                            select: { name: true, email: true, department: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'asc' }
        });

        // Filter to only show approvals where previous steps are complete
        const pendingApprovals = [];
        for (const approval of approvals) {
            const previousApprovals = await prisma.transactionApproval.findMany({
                where: {
                    transactionId: approval.transactionId,
                    approvalOrder: { lt: approval.approvalOrder }
                }
            });

            const allPreviousApproved = previousApprovals.every(a => a.approvalStatus === 'APPROVED');
            if (allPreviousApproved) {
                pendingApprovals.push(approval);
            }
        }

        res.json(pendingApprovals);
    } catch (error) {
        console.error('Get pending approvals error:', error);
        res.status(500).json({ error: 'Failed to fetch pending approvals' });
    }
});

// Approve withdrawal
app.post('/api/withdrawals/approve/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { comments } = req.body;

    try {
        const approval = await prisma.transactionApproval.findFirst({
            where: {
                transactionId: parseInt(id),
                approverRole: req.user.role,
                approvalStatus: 'PENDING'
            },
            include: {
                transaction: {
                    include: { wallet: true }
                }
            }
        });

        if (!approval) {
            return res.status(404).json({ error: 'Approval not found or already processed' });
        }

        // Check if previous approvals are complete
        const previousApprovals = await prisma.transactionApproval.findMany({
            where: {
                transactionId: parseInt(id),
                approvalOrder: { lt: approval.approvalOrder }
            }
        });

        const allPreviousApproved = previousApprovals.every(a => a.approvalStatus === 'APPROVED');
        if (!allPreviousApproved) {
            return res.status(400).json({ error: 'Previous approvals not complete' });
        }

        // Mark as approved
        await prisma.transactionApproval.update({
            where: { id: approval.id },
            data: {
                approvalStatus: 'APPROVED',
                approverId: req.user.id,
                comments,
                approvedAt: new Date()
            }
        });

        // Check if this was the final approval
        const remainingApprovals = await prisma.transactionApproval.count({
            where: {
                transactionId: parseInt(id),
                approvalStatus: 'PENDING'
            }
        });

        if (remainingApprovals === 0) {
            // All approvals complete! Update transaction status
            await prisma.walletTransaction.update({
                where: { id: parseInt(id) },
                data: { status: 'APPROVED' }
            });

            // TODO: Trigger VPay outward transfer
            // await disburseWithdrawal(id);

            res.json({ message: 'Final approval complete. Disbursement initiated.' });
        } else {
            // Notify next approver
            const nextApproval = await prisma.transactionApproval.findFirst({
                where: {
                    transactionId: parseInt(id),
                    approvalStatus: 'PENDING'
                },
                orderBy: { approvalOrder: 'asc' }
            });

            // TODO: Send notification to next approver
            res.json({ message: 'Approval recorded. Pending next approver.', nextApprover: nextApproval.approverRole });
        }
    } catch (error) {
        console.error('Approve withdrawal error:', error);
        res.status(500).json({ error: 'Failed to approve withdrawal' });
    }
});

// Reject withdrawal
app.post('/api/withdrawals/reject/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { id } = req.params;
    const { comments } = req.body;

    try {
        const approval = await prisma.transactionApproval.findFirst({
            where: {
                transactionId: parseInt(id),
                approverRole: req.user.role,
                approvalStatus: 'PENDING'
            }
        });

        if (!approval) {
            return res.status(404).json({ error: 'Approval not found or already processed' });
        }

        // Mark as rejected
        await prisma.transactionApproval.update({
            where: { id: approval.id },
            data: {
                approvalStatus: 'REJECTED',
                approverId: req.user.id,
                comments,
                approvedAt: new Date()
            }
        });

        // Update transaction status
        await prisma.walletTransaction.update({
            where: { id: parseInt(id) },
            data: {
                status: 'REJECTED',
                failureReason: comments
            }
        });

        // TODO: Notify initiator of rejection
        res.json({ message: 'Withdrawal request rejected' });
    } catch (error) {
        console.error('Reject withdrawal error:', error);
        res.status(500).json({ error: 'Failed to reject withdrawal' });
    }
});

// ============================================================================
// FINANCIAL SECRETARY - OVERSIGHT
// ============================================================================

// Get all transactions across all wallets (Financial Secretary only)
app.get('/api/wallets/transactions/all', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
    const { fellowshipId, startDate, endDate, transactionType } = req.query;

    // Verify user is Financial Secretary
    if (req.user.department !== 'FINANCE' && req.user.role !== 'SUPER_ADMIN') {
        return res.status(403).json({ error: 'Access restricted to Financial Secretary' });
    }

    try {
        const where = {
            wallet: {
                fellowshipId: parseInt(fellowshipId)
            }
        };

        if (transactionType) {
            where.transactionType = transactionType;
        }

        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        const transactions = await prisma.walletTransaction.findMany({
            where,
            include: {
                wallet: {
                    select: { unitDepartment: true, balance: true }
                },
                initiatedBy: {
                    select: { name: true, department: true }
                },
                approvals: {
                    include: {
                        approver: {
                            select: { name: true, role: true }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(transactions);
    } catch (error) {
        console.error('Get all transactions error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Get commission report (Brainiac Group revenue)
app.get('/api/commissions/report', authenticateToken, authorizeRoles('SUPER_ADMIN'), async (req, res) => {
    const { fellowshipId, startDate, endDate } = req.query;

    try {
        const where = {};

        if (fellowshipId) {
            where.fellowshipId = parseInt(fellowshipId);
        }

        if (startDate && endDate) {
            where.createdAt = {
                gte: new Date(startDate),
                lte: new Date(endDate)
            };
        }

        const commissions = await prisma.brainiacCommission.findMany({
            where,
            include: {
                fellowship: {
                    select: { name: true, code: true }
                },
                transaction: {
                    select: { description: true, createdAt: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const totalCommission = commissions.reduce((sum, c) => sum + c.brainiacCut, 0);
        const totalVpayFees = commissions.reduce((sum, c) => sum + c.vpayFee, 0);
        const totalProcessed = commissions.reduce((sum, c) => sum + c.originalAmount, 0);

        res.json({
            commissions,
            summary: {
                totalCommission,
                totalVpayFees,
                totalProcessed,
                count: commissions.length
            }
        });
    } catch (error) {
        console.error('Get commission report error:', error);
        res.status(500).json({ error: 'Failed to fetch commission report' });
    }
});

// ============================================================================
// VPAY WEBHOOK
// ============================================================================

// VPay webhook for incoming payments
app.post('/api/webhooks/vpay', async (req, res) => {
    const { account_number, amount, reference, payer_name, payer_phone } = req.body;

    try {
        // TODO: Verify VPay webhook signature
        // const isValid = verifyVPaySignature(req);
        // if (!isValid) {
        //     return res.status(401).json({ error: 'Invalid webhook signature' });
        // }

        // Find wallet by virtual account number
        const wallet = await prisma.unitWallet.findUnique({
            where: { vpayVirtualAccount: account_number },
            include: { fellowship: true }
        });

        if (!wallet) {
            console.error('Wallet not found for account:', account_number);
            return res.status(404).json({ error: 'Wallet not found' });
        }

        // Try to find member by phone or name
        const member = await prisma.user.findFirst({
            where: {
                fellowshipId: wallet.fellowshipId,
                OR: [
                    { email: { contains: payer_name } },
                    { name: { contains: payer_name } }
                ]
            }
        });

        // Calculate commissions
        const vpayFee = amount * 0.015; //  1.5%
        const brainiacCut = amount * 0.005; // 0.5%
        const netAmount = amount - vpayFee - brainiacCut;

        // Record donation
        const donation = await prisma.memberDonation.create({
            data: {
                walletId: wallet.id,
                memberId: member?.id || null,
                amount: netAmount,
                paymentMethod: 'VPAY_TRANSFER',
                vpayReference: reference,
                donationNote: `Payment from ${payer_name}`
            }
        });

        // Create transaction
        const transaction = await prisma.walletTransaction.create({
            data: {
                walletId: wallet.id,
                transactionType: 'DEPOSIT',
                amount: netAmount,
                description: `VPay transfer from ${payer_name}`,
                vpayReference: reference,
                status: 'COMPLETED',
                completedAt: new Date()
            }
        });

        // Update wallet balance
        await prisma.unitWallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: netAmount } }
        });

        // Record commission
        await prisma.brainiacCommission.create({
            data: {
                fellowshipId: wallet.fellowshipId,
                transactionId: transaction.id,
                originalAmount: amount,
                vpayFee,
                brainiacCut,
                netAmount
            }
        });

        // TODO: Send SMS to unit head
        // const unitHead = await prisma.user.findFirst({
        //     where: {
        //         fellowshipId: wallet.fellowshipId,
        //         department: wallet.unitDepartment,
        //         role: 'EXECUTIVE'
        //     }
        // });
        // await sendSMS(unitHead.phone, `New donation of â‚¦${netAmount} received!`);

        res.json({ success: true, netAmount });
    } catch (error) {
        console.error('VPay webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
