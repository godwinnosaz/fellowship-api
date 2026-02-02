// ============================================================================
// ANNOUNCEMENTS ROUTES
// ============================================================================
const express = require('express');
const router = express.Router();

module.exports = (prisma, { authenticateToken, authorizeRoles }) => {

    // Get announcements
    router.get('/', authenticateToken, async (req, res) => {
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
    router.post('/', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
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
    router.delete('/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
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

    return router;
};
