// ============================================================================
// SESSION MANAGEMENT ROUTES
// ============================================================================
const express = require('express');
const router = express.Router();

module.exports = (prisma, { authenticateToken, authorizeRoles }) => {

    // Get all sessions for a fellowship
    router.get('/', authenticateToken, async (req, res) => {
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
    router.post('/', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
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
    router.put('/:id/activate', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
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

    return router;
};
