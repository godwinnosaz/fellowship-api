// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================
const express = require('express');
const router = express.Router();

module.exports = (prisma, { hashPassword, comparePassword, generateResetToken, getResetTokenExpiry, generateToken }) => {

    // Verify Fellowship Code (Public)
    router.get('/public/fellowship/verify/:code', async (req, res) => {
        const { code } = req.params;
        try {
            const fellowship = await prisma.fellowship.findUnique({
                where: { code: code.toUpperCase() },
                select: {
                    id: true,
                    name: true,
                    code: true,
                    logo: true
                }
            });

            if (!fellowship) {
                return res.status(404).json({ error: 'Fellowship not found' });
            }

            res.json(fellowship);
        } catch (error) {
            console.error('Verify fellowship error:', error);
            res.status(500).json({ error: 'Failed to verify fellowship' });
        }
    });

    // Public Fellowship Registration
    router.post('/public/register-fellowship', async (req, res) => {
        const {
            fellowshipName,
            fellowshipCode,
            address,
            school,
            adminName,
            adminEmail,
            adminPassword,
            adminPhone,
            adminRole,
            adminDepartment
        } = req.body;

        try {
            // 1. Check if fellowship code exists
            const existingFellowship = await prisma.fellowship.findUnique({
                where: { code: fellowshipCode.toUpperCase() }
            });

            if (existingFellowship) {
                return res.status(400).json({ error: 'Fellowship code already taken' });
            }

            // 2. Check if admin email exists globally
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
                    code: fellowshipCode.toUpperCase(),
                    address: address,
                    school: school,
                    logo: '',
                }
            });

            // 4. Create Admin User
            const hashedPassword = await hashPassword(adminPassword);

            const role = adminRole || 'EXECUTIVE';
            let department = adminDepartment;

            if (!department) {
                department = role === 'EXECUTIVE' ? 'PRESIDENCY' : 'GENERAL';
            }

            const adminUser = await prisma.user.create({
                data: {
                    name: adminName,
                    email: adminEmail,
                    password: hashedPassword,
                    role: role,
                    department: department,
                    fellowshipId: fellowship.id,
                    phone: adminPhone
                }
            });

            // 5. Create Unit Wallets for default departments
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

            // 6. Generate Token
            adminUser.fellowship = fellowship;
            const token = generateToken(adminUser);

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

    // Login
    router.post('/login', async (req, res) => {
        const { email, password, memberIdOrEmail, fellowshipCode } = req.body;

        try {
            let user;

            // 1. Check for Super Admin (Global Login) if no fellowship code provided
            if ((!fellowshipCode || fellowshipCode.trim() === '') && (email || memberIdOrEmail)) {
                const loginEmail = email || memberIdOrEmail;

                user = await prisma.user.findUnique({
                    where: { email: loginEmail },
                    include: { fellowship: true }
                });

                if (user && user.role === 'SUPER_ADMIN') {
                    console.log('🛡️ Super Admin Global Login:', loginEmail);
                } else {
                    return res.status(401).json({ error: 'Fellowship Code is required for standard members' });
                }
            }
            // 2. Standard Member/Admin Login (with Fellowship Code)
            else if ((memberIdOrEmail || email) && fellowshipCode && password) {
                const loginValue = memberIdOrEmail || email;

                const fellowship = await prisma.fellowship.findUnique({
                    where: { code: fellowshipCode.toUpperCase() }
                });

                if (!fellowship) {
                    return res.status(401).json({ error: 'Invalid Fellowship Code' });
                }

                user = await prisma.user.findFirst({
                    where: {
                        AND: [
                            { fellowshipId: fellowship.id },
                            {
                                OR: [
                                    { email: loginValue },
                                    { username: loginValue },
                                    { membershipId: loginValue }
                                ]
                            }
                        ]
                    },
                    include: { fellowship: true }
                });

                if (!user) {
                    return res.status(401).json({ error: 'Invalid Credentials' });
                }
            } else {
                return res.status(400).json({ error: 'Missing login credentials' });
            }

            // Compare password
            const isPasswordValid = await comparePassword(password, user.password);
            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Invalid Password' });
            }

            // Generate JWT token
            const token = generateToken(user);
            const { password: _, ...userWithoutPassword } = user;

            return res.json({
                user: userWithoutPassword,
                fellowship: user.fellowship,
                token
            });

        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });

    // Register User
    router.post('/register', async (req, res) => {
        const { name, email, password, fellowshipCode } = req.body;

        try {
            const fellowship = await prisma.fellowship.findUnique({
                where: { code: fellowshipCode.toUpperCase() }
            });

            if (!fellowship) {
                return res.status(400).json({ error: 'Invalid Fellowship Code' });
            }

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
                    role: 'GENERAL',
                    fellowshipId: fellowship.id
                }
            });

            const token = generateToken(user);
            const { password: _, ...userWithoutPassword } = user;

            res.json({ user: userWithoutPassword, fellowship, token });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Registration failed' });
        }
    });

    // Request Password Reset
    router.post('/password/request-reset', async (req, res) => {
        const { email } = req.body;

        try {
            const user = await prisma.user.findUnique({ where: { email } });

            if (!user) {
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

            console.log(`Password reset token for ${email}: ${resetToken}`);

            res.json({ message: 'If email exists, reset link has been sent' });
        } catch (error) {
            console.error('Password reset request error:', error);
            res.status(500).json({ error: 'Failed to process request' });
        }
    });

    // Reset Password
    router.post('/password/reset', async (req, res) => {
        const { token, newPassword } = req.body;

        try {
            const user = await prisma.user.findFirst({
                where: {
                    resetPasswordToken: token,
                    resetPasswordExpires: {
                        gte: new Date()
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

    return router;
};
