// ============================================================================
// TASK MANAGEMENT ROUTES
// ============================================================================
const express = require('express');
const router = express.Router();

module.exports = (prisma, { authenticateToken, authorizeRoles }) => {

    // Get tasks
    router.get('/', authenticateToken, async (req, res) => {
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
    router.post('/', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
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
    router.put('/:id', authenticateToken, async (req, res) => {
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
    router.delete('/:id', authenticateToken, authorizeRoles('EXECUTIVE'), async (req, res) => {
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

    return router;
};
