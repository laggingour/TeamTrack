
const pool = require('./db');
const { hashPassword, verifyPassword } = require('./auth');

// Create a new user
async function createUser(fullName, email, password) {
  const passwordHash = await hashPassword(password);

  const result = await pool.query(
    `INSERT INTO users (full_name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING user_id, full_name, email, role, created_at`,
    [fullName, email.toLowerCase().trim(), passwordHash]
  );

  return result.rows[0];
}

// Find a user by email
async function findUserByEmail(email) {
  const result = await pool.query(
    `SELECT *
     FROM users
     WHERE email = $1`,
    [email.toLowerCase().trim()]
  );

  return result.rows[0] || null;
}

// Check a user's password
async function checkUserPassword(email, password) {
  const user = await findUserByEmail(email);

  if (!user || !user.is_active) {
    return false;
  }

  return verifyPassword(password, user.password_hash);
}

// Update a user's password
async function updatePassword(userId, newPassword) {
  const passwordHash = await hashPassword(newPassword);

  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $2 AND is_active = TRUE
     RETURNING user_id, email`,
    [passwordHash, userId]
  );

  return result.rows[0] || null;
}

// Deactivate a user account
async function deactivateUser(userId) {
  const result = await pool.query(
    `UPDATE users
     SET is_active = FALSE,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1
     RETURNING user_id, email, is_active`,
    [userId]
  );

  return result.rows[0] || null;
}

// Soft-delete a user account
async function softDeleteUser(userId) {
  const result = await pool.query(
    `UPDATE users
     SET is_active = FALSE,
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1
     RETURNING user_id, email, is_active`,
    [userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  createUser,
  findUserByEmail,
  checkUserPassword,
  updatePassword,
  deactivateUser,
  softDeleteUser
};
