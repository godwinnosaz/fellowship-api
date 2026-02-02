// ============================================================================
// MEMBERS & USERS ROUTES
// ============================================================================
const express = require('express');
const router = express.Router();

module.exports = (prisma, { authenticateToken, authorizeRoles }) => {

    // Get all members/users for a fellowship
    router.get('/', authenticateToken, async (req, res) => {
        const { fellowshipId, role, department } = req.query;

        try {
            const where = {};

            if (fellowshipId) {
                where.fellowshipId = parseInt(fellowshipId);
            }
            if (role) {
                where.role = role;
            }
            if (department) {
                where.department = department;
            }

            const users = await prisma.user.findMany({
                where,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    department: true,
                    createdAt: true,
                    fellowship: {
                        select: { id: true, name: true, code: true }
                    }
                },
                orderBy: { name: 'asc' }
            });

            res.json(users);
        } catch (error) {
            console.error('Get users error:', error);
            res.status(500).json({ error: 'Failed to fetch users' });
        }
    });

    // Get detailed member profile
    router.get('/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;

        try {
            const user = await prisma.user.findUnique({
                where: { id: parseInt(id) },
                include: {
                    fellowship: true,
                    assignedTasks: { take: 5, orderBy: { createdAt: 'desc' } }
                }
            });

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }

            const profile = {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone || '',
                joinDate: user.createdAt,
                department: user.department || 'General',
                role: user.role,
                fellowship: user.fellowship,
                attendance: 90,
                servicesAttended: 0,
                totalServices: 0,
                groups: [],
                badges: [],
                recentActivity: []
            };

            res.json(profile);
        } catch (error) {
            console.error('Fetch member profile error:', error);
            res.status(500).json({ error: 'Failed to fetch profile' });
        }
    });

    // Update member profile
    router.put('/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;
        const { name, phone, department, role } = req.body;

        try {
            // Ensure user is updating their own profile or is an admin
            if (parseInt(id) !== req.user.id && req.user.role !== 'SUPER_ADMIN' && req.user.role !== 'EXECUTIVE') {
                return res.status(403).json({ error: 'Unauthorized to update this profile' });
            }

            const updateData = {};
            if (name) updateData.name = name;
            if (phone) updateData.phone = phone;
            if (department) updateData.department = department;

            // Only executives can update roles
            if (role && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'EXECUTIVE')) {
                updateData.role = role;
            }

            const updatedUser = await prisma.user.update({
                where: { id: parseInt(id) },
                data: updateData
            });

            const profile = {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                phone: updatedUser.phone || '',
                joinDate: updatedUser.createdAt,
                department: updatedUser.department || 'General',
                role: updatedUser.role
            };

            res.json(profile);
        } catch (error) {
            console.error('Update profile error:', error);
            res.status(500).json({ error: 'Failed to update profile' });
        }
    });

    // Delete user (admin only)
    router.delete('/:id', authenticateToken, authorizeRoles('EXECUTIVE', 'SUPER_ADMIN'), async (req, res) => {
        const { id } = req.params;

        try {
            await prisma.user.delete({
                where: { id: parseInt(id) }
            });
            res.json({ success: true });
        } catch (error) {
            console.error('Delete user error:', error);
            res.status(500).json({ error: 'Failed to delete user' });
        }
    });

    return router;
};
