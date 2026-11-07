
const pool = require("../db");
const { refreshAccessToken } = require("./asana-auth");

// Save Asana OAuth connection to PostgreSQL
async function saveConnection(userId, tokens) {
  if (!userId || !tokens?.access_token) {
    throw new Error("Missing user ID or Asana access token");
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
    : null;

  await pool.query(
    `INSERT INTO asana_connections
       (user_id, access_token, refresh_token, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [
      userId,
      tokens.access_token,
      tokens.refresh_token || null,
      expiresAt
    ]
  );
}

// Retrieve the latest Asana connection for a user
async function getConnection(userId) {
  const result = await pool.query(
    `SELECT connection_id, user_id, access_token, refresh_token, expires_at
     FROM asana_connections
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  return result.rows[0] || null;
}

// Refresh an expired Asana access token
async function refreshConnection(userId) {
  const connection = await getConnection(userId);

  if (!connection) {
    throw new Error("Asana connection not found");
  }

  if (!connection.refresh_token) {
    throw new Error("Asana refresh token not found");
  }

  const tokens = await refreshAccessToken(
    connection.refresh_token
  );

  if (!tokens.access_token) {
    throw new Error("Asana did not return an access token");
  }

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
    : null;

  await pool.query(
    `UPDATE asana_connections
     SET access_token = $1,
         refresh_token = $2,
         expires_at = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE connection_id = $4`,
    [
      tokens.access_token,
      tokens.refresh_token || connection.refresh_token,
      expiresAt,
      connection.connection_id
    ]
  );

  return tokens.access_token;
}

// Export functions
module.exports = {
  saveConnection,
  getConnection,
  refreshConnection
};
