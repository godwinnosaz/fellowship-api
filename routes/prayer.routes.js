// ============================================================================
// PRAYER REQUESTS ROUTES
// ============================================================================
const express = require('express');
const router = express.Router();

module.exports = (prisma, { authenticateToken, authorizeRoles }) => {

    // Get prayer requests
    router.get('/', authenticateToken, async (req, res) => {
        const { fellowshipId, status } = req.query;

        try {
            const where = { fellowshipId: parseInt(fellowshipId) };
            if (status) {
                where.status = status;
            }

            const requests = await prisma.prayerRequest.findMany({
                where,
                orderBy: { createdAt: 'desc' }
            });

            // Hide requestor name for anonymous requests
            const processed = requests.map(r => ({
                ...r,
                requestorName: r.isAnonymous ? 'Anonymous' : r.requestorName
            }));

            res.json(processed);
        } catch (error) {
            console.error('Get prayer requests error:', error);
            res.status(500).json({ error: 'Failed to fetch prayer requests' });
        }
    });

    // Create prayer request
    router.post('/', authenticateToken, async (req, res) => {
        const { requestorName, request, isAnonymous, fellowshipId } = req.body;

        try {
            const prayerRequest = await prisma.prayerRequest.create({
                data: {
                    requestorName: requestorName || req.user.name,
                    request,
                    isAnonymous: isAnonymous || false,
                    fellowshipId: parseInt(fellowshipId)
                }
            });

            res.json(prayerRequest);
        } catch (error) {
            console.error('Create prayer request error:', error);
            res.status(500).json({ error: 'Failed to create prayer request' });
        }
    });

    // Update prayer request status
    router.put('/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;
        const { status } = req.body;

        try {
            const prayerRequest = await prisma.prayerRequest.update({
                where: { id: parseInt(id) },
                data: { status }
            });

            res.json(prayerRequest);
        } catch (error) {
            console.error('Update prayer request error:', error);
            res.status(500).json({ error: 'Failed to update prayer request' });
        }
    });

    // Delete prayer request
    router.delete('/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
        const { id } = req.params;

        try {
            await prisma.prayerRequest.delete({
                where: { id: parseInt(id) }
            });
            res.json({ success: true });
        } catch (error) {
            console.error('Delete prayer request error:', error);
            res.status(500).json({ error: 'Failed to delete prayer request' });
        }
    });

    return router;
};
