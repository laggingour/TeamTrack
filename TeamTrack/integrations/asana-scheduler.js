
require("dotenv").config();

const pool = require("../db");
const { collectAsanaData } = require("./sync");
const { saveAsanaData } = require("./asana-db");

const {
  getConnection,
  refreshConnection
} = require("./asana-connection-store");

// Prevent overlapping synchronisations
let syncing = false;
let scheduler = null;

// Synchronise Asana data with PostgreSQL
async function syncAsana() {
  if (syncing) {
    console.log("Asana sync skipped: previous sync still running.");
    return;
  }

  syncing = true;

  console.log(
    `[${new Date().toLocaleString()}] Starting automatic Asana sync...`
  );

  try {
    // Find all users with connected Asana accounts
    const result = await pool.query(
      `SELECT DISTINCT user_id FROM asana_connections`
    );

    if (result.rows.length === 0) {
      console.log("No Asana accounts connected.");
      return;
    }

    for (const { user_id } of result.rows) {
      try {
        // Retrieve the user's latest OAuth connection
        const connection = await getConnection(user_id);

        if (!connection) {
          console.log("No Asana connection found for:", user_id);
          continue;
        }

        let token = connection.access_token;

        // Check whether the token has expired
        const expiresAt = connection.expires_at
          ? new Date(connection.expires_at).getTime()
          : 0;

        // Refresh token if expired or expiring soon
        if (!expiresAt || Date.now() >= expiresAt - 60000) {
          console.log("Refreshing Asana access token...");
          token = await refreshConnection(user_id);
        }

        // Retrieve projects, tasks and activities
        console.log("Fetching Asana data...");

        const data = await collectAsanaData(token);

        // Save data with the correct Pulse user ID
        const saved = await saveAsanaData(data, user_id);

        console.log("Asana sync completed:", {
          userId: user_id,
          ...saved
        });

      } catch (error) {
        console.error(
          "Asana sync failed for user:",
          user_id,
          error.message
        );
      }
    }

  } catch (error) {
    console.error("Asana scheduler error:", error.message);

  } finally {
    syncing = false;
  }
}

// Run once immediately, then every 5 minutes
function startAsanaScheduler() {
  if (scheduler) {
    console.log("Asana scheduler already started.");
    return scheduler;
  }

  console.log("Asana automatic sync scheduled every 5 minutes.");

  // First sync immediately
  void syncAsana();

  // Repeat every 5 minutes
  scheduler = setInterval(() => {
    void syncAsana();
  }, 5 * 60 * 1000);

  return scheduler;
}

// Stop scheduler when needed
function stopAsanaScheduler() {
  if (scheduler) {
    clearInterval(scheduler);
    scheduler = null;
    console.log("Asana scheduler stopped.");
  }
}

module.exports = {
  syncAsana,
  startAsanaScheduler,
  stopAsanaScheduler
};
