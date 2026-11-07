
require("dotenv").config();

const {
  createOAuthState,
  getAuthorizationUrl
} = require("./integrations/asana-auth");

try {
  const state = createOAuthState();
  const url = getAuthorizationUrl(state);
  const parsed = new URL(url);

  console.log("OAuth URL generation successful!");
  console.log("Authorization host:", parsed.hostname);
  console.log(
    "Client ID configured:",
    Boolean(parsed.searchParams.get("client_id"))
  );
  console.log(
    "Redirect URI:",
    parsed.searchParams.get("redirect_uri")
  );
  console.log(
    "State generated:",
    state.length === 64
  );
} catch (error) {
  console.error("OAuth test failed:", error.message);
  process.exitCode = 1;
}
