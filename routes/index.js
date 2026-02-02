// ============================================================================
// ROUTE INDEX - Combines all route modules
// ============================================================================
const express = require('express');

module.exports = (prisma, middleware) => {
    const router = express.Router();

    // Import route modules
    const authRoutes = require('./auth.routes')(prisma, middleware);
    const sessionsRoutes = require('./sessions.routes')(prisma, middleware);
    const tasksRoutes = require('./tasks.routes')(prisma, middleware);
    const announcementsRoutes = require('./announcements.routes')(prisma, middleware);
    const membersRoutes = require('./members.routes')(prisma, middleware);
    const eventsRoutes = require('./events.routes')(prisma, middleware);
    const firstTimersRoutes = require('./first-timers.routes')(prisma, middleware);
    const prayerRoutes = require('./prayer.routes')(prisma, middleware);

    // Mount routes
    router.use('/', authRoutes);  // Auth routes at root (/api/login, /api/register, etc.)
    router.use('/sessions', sessionsRoutes);
    router.use('/tasks', tasksRoutes);
    router.use('/announcements', announcementsRoutes);
    router.use('/members', membersRoutes);
    router.use('/users', membersRoutes);  // Alias for /members
    router.use('/events', eventsRoutes);
    router.use('/first-timers', firstTimersRoutes);
    router.use('/prayer-requests', prayerRoutes);

    return router;
};
