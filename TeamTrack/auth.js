
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

// Convert a plain password into a secure hash
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

// Check whether a password matches its stored hash
async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

module.exports = {
  hashPassword,
  verifyPassword
};
