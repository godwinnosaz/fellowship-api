// ============================================================================
// CENTRALIZED ERROR HANDLER
// ============================================================================

class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    // Log error for debugging
    console.error('Error:', {
        message: err.message,
        statusCode: err.statusCode,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });

    // Prisma-specific errors
    if (err.code === 'P2002') {
        err.statusCode = 400;
        err.message = 'A record with this value already exists.';
    }
    if (err.code === 'P2025') {
        err.statusCode = 404;
        err.message = 'Record not found.';
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        err.statusCode = 401;
        err.message = 'Invalid token. Please login again.';
    }
    if (err.name === 'TokenExpiredError') {
        err.statusCode = 401;
        err.message = 'Token expired. Please login again.';
    }

    // Send response
    res.status(err.statusCode).json({
        status: err.status,
        error: err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

// Async handler wrapper to catch errors
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = {
    AppError,
    errorHandler,
    asyncHandler
};
