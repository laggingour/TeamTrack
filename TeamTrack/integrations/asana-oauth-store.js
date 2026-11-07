const crypto = require("crypto");
const pool = require("../db");

// Save a temporary OAuth state for the logged-in user
async function saveOAuthState(userId, state) {
  const stateHash = crypto
    .createHash("sha256")
    .update(state)
    .digest("hex");

  await pool.query(
    `INSERT INTO asana_oauth_states
     (state_hash, user_id, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
    [stateHash, userId]
  );
}

// Validate and delete the state so it cannot be reused
async function consumeOAuthState(state) {
  const stateHash = crypto
    .createHash("sha256")
    .update(state)
    .digest("hex");

  const result = await pool.query(
    `DELETE FROM asana_oauth_states
     WHERE state_hash = $1
       AND expires_at > NOW()
     RETURNING user_id`,
    [stateHash]
  );

  return result.rows[0]?.user_id || null;
}

module.exports = {
  saveOAuthState,
  consumeOAuthState
};