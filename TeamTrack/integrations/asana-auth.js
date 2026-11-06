
const crypto = require("node:crypto");

const ASANA_AUTHORIZE_URL =
  "https://app.asana.com/-/oauth_authorize";

const ASANA_TOKEN_URL =
  "https://app.asana.com/-/oauth_token";

const SCOPES = [
  "default",
  "projects:read",
  "tasks:read",
  "stories:read"
];

function getConfig() {
  const {
    ASANA_CLIENT_ID,
    ASANA_CLIENT_SECRET,
    ASANA_REDIRECT_URI
  } = process.env;

  if (
    !ASANA_CLIENT_ID ||
    !ASANA_CLIENT_SECRET ||
    !ASANA_REDIRECT_URI
  ) {
    throw new Error("Missing Asana OAuth configuration");
  }

  return {
    clientId: ASANA_CLIENT_ID,
    clientSecret: ASANA_CLIENT_SECRET,
    redirectUri: ASANA_REDIRECT_URI
  };
}

function createOAuthState() {
  return crypto.randomBytes(32).toString("hex");
}

function getAuthorizationUrl(state) {
  if (!state) {
    throw new Error("OAuth state is required");
  }

  const config = getConfig();

  const url = new URL(ASANA_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", SCOPES.join(" "));

  return url.toString();
}

async function requestToken(parameters) {
  const config = getConfig();

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...parameters
  });

  const response = await fetch(ASANA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!response.ok) {
    throw new Error(
      `Asana OAuth token request failed (${response.status})`
    );
  }

  return response.json();
}

async function exchangeAuthorizationCode(code) {
  if (!code) {
    throw new Error("Authorization code is required");
  }

  const config = getConfig();

  return requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri
  });
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new Error("Refresh token is required");
  }

  return requestToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
}

module.exports = {
  createOAuthState,
  getAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshAccessToken
};
