
require("dotenv").config();

const express = require("express");
const path = require("path");
const { rateLimit } = require("express-rate-limit");

const pool = require("./db");
const { findUserByEmail } = require("./users");
const { verifyPassword } = require("./auth");
const { generateToken, verifyToken } = require("./jwt");

const projects = require("./data");
const { calc, history, buildAlerts } = require("./scoring");

const app = express();

app.use(express.json());

let settings = { low: 70, med: 40 };

const rows = () =>
  projects.map((project) => ({
    p: project,
    r: calc(project, settings)
  }));

// Login request rate limit.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: "Too many login requests. Please try again later."
    });
  }
});

// Record login attempts in PostgreSQL.
async function recordLoginAttempt(userId, email, ipAddress, successful) {
  await pool.query(
    `INSERT INTO login_attempts
      (user_id, email, ip_address, successful)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, ipAddress || null, successful]
  );
}

// --------------------------------------------------
// LOGIN
// --------------------------------------------------

app.post("/api/login", loginLimiter, async (req, res) => {
  try {
    const email = String(req.body?.email || "").toLowerCase().trim();
    const password = String(req.body?.password || "");
    const ipAddress = req.ip;

    const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

    if (!validEmail || !password) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      await recordLoginAttempt(null, email, ipAddress, false);

      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await recordLoginAttempt(user.user_id, email, ipAddress, false);

      return res.status(429).json({
        error: "Too many failed attempts. Please try again in 15 minutes."
      });
    }

    const passwordIsCorrect =
      user.is_active &&
      await verifyPassword(password, user.password_hash);

    if (!passwordIsCorrect) {
      await pool.query(
        `UPDATE users
         SET failed_login_attempts = failed_login_attempts + 1,
             locked_until = CASE
               WHEN failed_login_attempts + 1 >= 5
               THEN CURRENT_TIMESTAMP + INTERVAL '15 minutes'
               ELSE locked_until
             END,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [user.user_id]
      );

      await recordLoginAttempt(user.user_id, email, ipAddress, false);

      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1`,
      [user.user_id]
    );

    await recordLoginAttempt(user.user_id, email, ipAddress, true);

    const token = generateToken(user);

    return res.json({
      ok: true,
      token,
      user: {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      error: "Unable to log in right now. Please try again."
    });
  }
});

// --------------------------------------------------
// JWT AUTHENTICATION
// --------------------------------------------------

async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Please log in to continue."
      });
    }

    const token = authorization.slice(7);
    const decoded = verifyToken(token);

    const result = await pool.query(
      `SELECT user_id, full_name, email, role, is_active
       FROM users
       WHERE user_id = $1`,
      [decoded.userId]
    );

    const user = result.rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({
        error: "Your session is no longer valid. Please log in again."
      });
    }

    req.user = user;
    next();

  } catch (error) {
    return res.status(401).json({
      error: "Your session is invalid or has expired. Please log in again."
    });
  }
}

// --------------------------------------------------
// PROJECT LIST
// IMPORTANT: Keep the score inside the "r" object.
// This is the format expected by public/app.js.
// --------------------------------------------------

app.get("/api/projects", requireAuth, (req, res) => {
  res.json(
    rows().map(({ p, r }) => ({
      ...p,
      r,
      history: r.status === "OK" ? history(p, r.score) : []
    }))
  );
});

// --------------------------------------------------
// SINGLE PROJECT
// --------------------------------------------------

app.get("/api/projects/:id", requireAuth, (req, res) => {
  const row = rows().find(
    (item) => item.p.id === Number(req.params.id)
  );

  if (!row) {
    return res.status(404).json({
      error: "Project not found."
    });
  }

  res.json({
    ...row.p,
    r: row.r,
    history: row.r.status === "OK"
      ? history(row.p, row.r.score)
      : []
  });
});

// --------------------------------------------------
// ALERTS
// --------------------------------------------------

app.get("/api/alerts", requireAuth, (req, res) => {
  res.json(buildAlerts(rows()));
});

// --------------------------------------------------
// SETTINGS
// --------------------------------------------------

app.get("/api/settings", requireAuth, (req, res) => {
  res.json(settings);
});

app.put("/api/settings", requireAuth, (req, res) => {
  const low = Number(req.body.low);
  const med = Number(req.body.med);

  if (!(low >= 1 && low <= 100 && med >= 1 && med < low)) {
    return res.status(400).json({
      error: "The Medium threshold must be lower than the Low threshold."
    });
  }

  settings = { low, med };

  res.json(settings);
});

// --------------------------------------------------
// FRONTEND WEBSITE
// --------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Pulse running at http://localhost:${PORT}`);
});
