
const express = require("express");

const {
  createOAuthState,
  getAuthorizationUrl,
  exchangeAuthorizationCode
} = require("./asana-auth");

function createAsanaRouter({
  requireAuth,
  saveOAuthState,
  consumeOAuthState,
  saveConnection
}) {
  const router = express.Router();

  // Dependencies must come from the existing
  // JWT authentication and database implementation.
  for (const [name, fn] of Object.entries({
    requireAuth,
    saveOAuthState,
    consumeOAuthState,
    saveConnection
  })) {
    if (typeof fn !== "function") {
      throw new Error(`Missing Asana dependency: ${name}`);
    }
  }

  // GET /api/asana/connect
  // Only an authenticated Pulse user can connect.
  router.get("/connect", requireAuth, async (req, res) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({
          error: "Authentication required"
        });
      }

      const state = createOAuthState();

      // Must be stored server-side, with expiry,
      // and associated with the Pulse user.
      await saveOAuthState(req.user.id, state);

      return res.json({
      authorizationUrl: getAuthorizationUrl(state)
      });
    } catch (error) {
      console.error("Asana connection failed:", error.message);

      return res.status(500).json({
        error: "Unable to start Asana connection"
      });
    }
  });

  // GET /api/asana/callback
  router.get("/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) {
        return res.status(400).json({
          error: "Asana authorisation was denied"
        });
      }

      if (
        typeof code !== "string" ||
        typeof state !== "string" ||
        !code ||
        !state
      ) {
        return res.status(400).json({
          error: "Missing OAuth code or state"
        });
      }

      // This function must atomically validate and
      // consume the state, returning the Pulse user ID.
      // Invalid, expired or reused states must be rejected.
      const userId = await consumeOAuthState(state);

      if (!userId) {
        return res.status(400).json({
          error: "Invalid or expired OAuth state"
        });
      }

      const tokens = await exchangeAuthorizationCode(code);

      if (!tokens.access_token) {
        throw new Error("No access token returned");
      }

      // Implement secure, encrypted token storage
      // through the existing PostgreSQL database layer.
      await saveConnection(userId, tokens);

      // Never send tokens to the browser.
      return res.json({
        ok: true,
        message: "Asana account connected successfully"
      });
    } catch (error) {
      console.error("Asana OAuth callback failed:", error.message);

      return res.status(500).json({
        error: "Unable to complete Asana connection"
      });
    }
  });

  return router;
}

module.exports = { createAsanaRouter };
