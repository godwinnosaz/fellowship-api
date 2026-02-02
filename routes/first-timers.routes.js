// ============================================================================
// FIRST TIMERS ROUTES
// ============================================================================
const express = require('express');
const router = express.Router();

module.exports = (prisma, { authenticateToken, authorizeRoles }) => {

    // Get all first timers
    router.get('/', authenticateToken, async (req, res) => {
        const { fellowshipId, followedUp } = req.query;

        try {
            const where = { fellowshipId: parseInt(fellowshipId) };
            if (followedUp !== undefined) {
                where.followedUp = followedUp === 'true';
            }

            const firstTimers = await prisma.firstTimer.findMany({
                where,
                include: {
                    followUps: {
                        include: {
                            agent: { select: { id: true, name: true } }
                        },
                        orderBy: { followUpDate: 'desc' }
                    }
                },
                orderBy: { visitDate: 'desc' }
            });

            res.json(firstTimers);
        } catch (error) {
            console.error('Get first timers error:', error);
            res.status(500).json({ error: 'Failed to fetch first timers' });
        }
    });

    // Register first timer
    router.post('/', authenticateToken, async (req, res) => {
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
            console.error('Register first timer error:', error);
            res.status(500).json({ error: 'Failed to register first timer' });
        }
    });

    // Add follow-up
    router.post('/:id/follow-up', authenticateToken, async (req, res) => {
        const { id } = req.params;
        const { notes, nextAction } = req.body;

        try {
            const followUp = await prisma.followUp.create({
                data: {
                    firstTimerId: parseInt(id),
                    agentId: req.user.id,
                    notes,
                    nextAction
                }
            });

            // Mark as followed up
            await prisma.firstTimer.update({
                where: { id: parseInt(id) },
                data: { followedUp: true }
            });

            res.json(followUp);
        } catch (error) {
            console.error('Add follow-up error:', error);
            res.status(500).json({ error: 'Failed to add follow-up' });
        }
    });

    // Delete first timer
    router.delete('/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
        const { id } = req.params;

        try {
            // Delete follow-ups first
            await prisma.followUp.deleteMany({
                where: { firstTimerId: parseInt(id) }
            });

            await prisma.firstTimer.delete({
                where: { id: parseInt(id) }
            });

            res.json({ success: true });
        } catch (error) {
            console.error('Delete first timer error:', error);
            res.status(500).json({ error: 'Failed to delete first timer' });
        }
    });

    return router;
};
