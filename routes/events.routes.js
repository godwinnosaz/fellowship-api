// ============================================================================
// EVENTS ROUTES
// ============================================================================
const express = require('express');
const router = express.Router();

module.exports = (prisma, { authenticateToken, authorizeRoles }) => {

    // Get all events for a fellowship
    router.get('/', authenticateToken, async (req, res) => {
        const { fellowshipId, status } = req.query;

        try {
            const where = { fellowshipId: parseInt(fellowshipId) };
            if (status) {
                where.status = status;
            }

            const events = await prisma.event.findMany({
                where,
                orderBy: { date: 'desc' }
            });

            res.json(events);
        } catch (error) {
            console.error('Get events error:', error);
            res.status(500).json({ error: 'Failed to fetch events' });
        }
    });

    // Get single event
    router.get('/:id', authenticateToken, async (req, res) => {
        const { id } = req.params;

        try {
            const event = await prisma.event.findUnique({
                where: { id: parseInt(id) }
            });

            if (!event) {
                return res.status(404).json({ error: 'Event not found' });
            }

            res.json(event);
        } catch (error) {
            console.error('Get event error:', error);
            res.status(500).json({ error: 'Failed to fetch event' });
        }
    });

    // Create event
    router.post('/', authenticateToken, authorizeRoles('EXECUTIVE', 'WORKER'), async (req, res) => {
        const { title, description, date, time, location, type, fellowshipId } = req.body;

        try {
            const event = await prisma.event.create({
                data: {
                    title,
                    description,
                    date,
                    time,
                    location,
                    type,
                    fellowshipId: parseInt(fellowshipId)
                }
            });

            res.json(event);
        } catch (error) {
            console.error('Create event error:', error);
            res.status(500).json({ error: 'Failed to create event' });
        }
    });

    // Update event
    router.put('/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
        const { id } = req.params;
        const { title, description, date, time, location, type, status } = req.body;

        try {
            const updateData = {};
            if (title) updateData.title = title;
            if (description) updateData.description = description;
            if (date) updateData.date = date;
            if (time) updateData.time = time;
            if (location) updateData.location = location;
            if (type) updateData.type = type;
            if (status) updateData.status = status;

            const event = await prisma.event.update({
                where: { id: parseInt(id) },
                data: updateData
            });

            res.json(event);
        } catch (error) {
            console.error('Update event error:', error);
            res.status(500).json({ error: 'Failed to update event' });
        }
    });

    // Delete event
    router.delete('/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
        const { id } = req.params;

        try {
            await prisma.event.delete({
                where: { id: parseInt(id) }
            });
            res.json({ success: true });
        } catch (error) {
            console.error('Delete event error:', error);
            res.status(500).json({ error: 'Failed to delete event' });
        }
    });

    // Approve event
    router.put('/:id/approve', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
        const { id } = req.params;

        try {
            const event = await prisma.event.update({
                where: { id: parseInt(id) },
                data: { status: 'APPROVED' }
            });
            res.json(event);
        } catch (error) {
            console.error('Approve event error:', error);
            res.status(500).json({ error: 'Failed to approve event' });
        }
    });

    return router;
};
