// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// General rate limiter (100 requests per 15 minutes)
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict rate limiter for auth endpoints (10 requests per 15 minutes)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Configure helmet with reasonable defaults
const helmetConfig = helmet({
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin for uploads
});

module.exports = {
    helmet: helmetConfig,
    generalLimiter,
    authLimiter
};
