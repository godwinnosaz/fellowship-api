const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

/**
 * Middleware to authenticate JWT tokens
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user; // Attach user info to request
    next();
  });
};

/**
 * Middleware to authorize specific roles
 * Usage: authorizeRoles('EXECUTIVE', 'WORKER')
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Access denied. Insufficient permissions.' 
      });
    }
    
    next();
  };
};

/**
 * Middleware to authorize specific departments (for executives)
 */
const authorizeDepartments = (...departments) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (req.user.role !== 'EXECUTIVE') {
      return res.status(403).json({ error: 'Executive access required' });
    }
    
    if (!departments.includes(req.user.department)) {
      return res.status(403).json({ 
        error: `Access denied. Requires: ${departments.join(' or ')}` 
      });
    }
    
    next();
  };
};

/**
 * Generate JWT token for a user
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      department: user.department,
      fellowshipId: user.fellowshipId
    },
    JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeDepartments,
  generateToken,
  JWT_SECRET
};
