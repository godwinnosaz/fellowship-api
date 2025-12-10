const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
async function hashPassword(password) {
    const saltRounds = 10;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Compare a password with a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} - True if password matches
 */
async function comparePassword(password, hash) {
    return await bcrypt.compare(password, hash);
}

/**
 * Generate a random OTP (6 digits)
 * @returns {string} - 6-digit OTP
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a password reset token
 * @returns {string} - Random reset token
 */
function generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculate reset token expiry (1 hour from now)
 * @returns {Date} - Expiry date
 */
function getResetTokenExpiry() {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 1);
    return expiry;
}

module.exports = {
    hashPassword,
    comparePassword,
    generateOTP,
    generateResetToken,
    getResetTokenExpiry
};
