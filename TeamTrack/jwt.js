
require('dotenv').config();

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is missing from .env');
}

// Create an authentication token
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.user_id,
      role: user.role
    },
    JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: '8h'
    }
  );
}

// Verify an authentication token
function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256']
  });
}

module.exports = {
  generateToken,
  verifyToken
};
