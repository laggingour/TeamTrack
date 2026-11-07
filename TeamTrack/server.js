
require("dotenv").config();

const express = require("express");
const path = require("path");
const { rateLimit } = require("express-rate-limit");

const pool = require("./db");
const { findUserByEmail, createUser } = require("./users");
const { verifyPassword } = require("./auth");
const { generateToken, verifyToken } = require("./jwt");
const { calc, buildAlerts } = require("./scoring");
const { startAsanaScheduler } = require("./integrations/asana-scheduler");
const { createAsanaRouter } = require("./integrations/asana-routes");
const {
  saveOAuthState,
  consumeOAuthState
} = require("./integrations/asana-oauth-store");
const { saveConnection } = require("./integrations/asana-connection-store");
const app = express();

app.use(express.json());

let settings = { low: 70, med: 40 };

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function daysSince(date) {
  if (!date) return 999;

  return Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  );
}

function timeAgo(date) {
  if (!date) return "Awaiting first sync";

  const hours = Math.floor(
    (Date.now() - new Date(date).getTime()) / 3600000
  );

  if (hours < 1) return "Less than an hour ago";
  if (hours < 24) return `${hours} hours ago`;

  const days = Math.floor(hours / 24);

  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

// --------------------------------------------------
// LOAD PROJECTS FROM POSTGRESQL
// --------------------------------------------------

async function loadProjects(userId) {

  // Only load projects the signed-in user owns or belongs to.
  const projectResult = await pool.query(
    `SELECT p.*
     FROM projects p
     WHERE p.owner_id = $1
        OR EXISTS (
          SELECT 1
          FROM project_team_members ptm
          WHERE ptm.project_id = p.project_id
            AND ptm.user_id = $1
        )
     ORDER BY p.created_at DESC`,
    [userId]
  );

  const projects = [];

  for (const project of projectResult.rows) {

    // Load team members, including the project owner.
    const memberResult = await pool.query(
      `SELECT DISTINCT
          u.user_id,
          u.full_name,
          COALESCE(ptm.joined_at, p.created_at) AS joined_at
       FROM projects p
       JOIN users u ON (
          u.user_id = p.owner_id
          OR EXISTS (
            SELECT 1
            FROM project_team_members ptm2
            WHERE ptm2.project_id = p.project_id
              AND ptm2.user_id = u.user_id
          )
       )
       LEFT JOIN project_team_members ptm
          ON ptm.project_id = p.project_id
         AND ptm.user_id = u.user_id
       WHERE p.project_id = $1
       ORDER BY u.full_name`,
      [project.project_id]
    );

    // Load tasks and calculate overdue days.
    const taskResult = await pool.query(
      `SELECT
          assigned_to,
          status,
          CASE
            WHEN due_date < CURRENT_DATE
             AND LOWER(TRIM(status)) NOT IN ('completed', 'complete', 'done')
            THEN CURRENT_DATE - due_date
            ELSE NULL
          END AS overdue_days
       FROM tasks
       WHERE project_id = $1`,
      [project.project_id]
    );

    // Load each member's latest recorded activity.
    const activityResult = await pool.query(
      `SELECT user_id, MAX(activity_date) AS last_action
       FROM activity_logs
       WHERE project_id = $1
       GROUP BY user_id`,
      [project.project_id]
    );

    const activityByUser = new Map(
      activityResult.rows.map(row => [
        row.user_id,
        row.last_action
      ])
    );

    const tasks = taskResult.rows;

    const completedTasks = tasks.filter(task =>
      ["completed", "complete", "done"].includes(
        String(task.status).toLowerCase().trim()
      )
    );

    const overdueTasks = tasks
      .filter(task => task.overdue_days !== null)
      .map(task => Number(task.overdue_days));

    // Count completed tasks assigned to each member.
    const members = memberResult.rows.map(member => {
      const completedByMember = completedTasks.filter(
        task => task.assigned_to === member.user_id
      ).length;

      const lastAction =
        activityByUser.get(member.user_id) || member.joined_at;

      return [
        member.full_name,
        daysSince(lastAction),
        completedByMember
      ];
    });

    // The scoring engine needs at least one member when tasks exist.
    if (members.length === 0 && tasks.length > 0) {
      members.push(["Unassigned", 999, 0]);
    }

    // Count messages over the last 14 days.
    const messageResult = await pool.query(
      `SELECT COUNT(*)::int AS message_count
       FROM messages
       WHERE project_id = $1
         AND created_at >= CURRENT_TIMESTAMP - INTERVAL '14 days'`,
      [project.project_id]
    );

    const commentsPerDay =
      Number(messageResult.rows[0].message_count) / 14;

    // Find the most recent project activity or message.
    const lastActivityResult = await pool.query(
      `SELECT MAX(event_time) AS last_activity
       FROM (
         SELECT activity_date AS event_time
         FROM activity_logs
         WHERE project_id = $1

         UNION ALL

         SELECT created_at AS event_time
         FROM messages
         WHERE project_id = $1
       ) AS events`,
      [project.project_id]
    );

    // Read previously saved health scores for the trend chart.
    const historyResult = await pool.query(
      `SELECT health_score
       FROM project_health
       WHERE project_id = $1
       ORDER BY recorded_at ASC`,
      [project.project_id]
    );

    const projectData = {
      id: project.project_id,
      name: project.project_name,
      dept: "General",
      status: project.status,
      done: completedTasks.length,
      total: tasks.length,
      od: overdueTasks,
      m: members,
      cpd: commentsPerDay,
      last: timeAgo(lastActivityResult.rows[0].last_activity),
      drift: 0
    };

    projectData.history = historyResult.rows.map(
      row => Number(row.health_score)
    );

    projects.push(projectData);
  }

  return projects;
}

// --------------------------------------------------
// LOGIN RATE LIMIT
// --------------------------------------------------

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

// --------------------------------------------------
// RECORD LOGIN ATTEMPTS
// --------------------------------------------------

async function recordLoginAttempt(
  userId,
  email,
  ipAddress,
  successful
) {
  await pool.query(
    `INSERT INTO login_attempts
      (user_id, email, ip_address, successful)
     VALUES ($1, $2, $3, $4)`,
    [userId, email, ipAddress || null, successful]
  );
}


// --------------------------------------------------
// LOGIN AND REGISTRATION
// --------------------------------------------------

// Limit login requests.

// Limit registration requests.
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false
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

// REGISTER
app.post("/api/register", registerLimiter, async (req, res) => {
  try {
    const fullName = String(req.body?.fullName || "").trim();
    const email = String(req.body?.email || "").toLowerCase().trim();
    const password = String(req.body?.password || "");

    const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

    if (!fullName || fullName.length > 100) {
      return res.status(400).json({
        error: "Please enter a name of up to 100 characters."
      });
    }

    if (!validEmail || email.length > 255) {
      return res.status(400).json({
        error: "Please enter a valid email address."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long."
      });
    }

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    const user = await createUser(fullName, email, password);
    const token = generateToken(user);

    return res.status(201).json({
      ok: true,
      token,
      user
    });

  } catch (error) {
    console.error("Registration error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    return res.status(500).json({
      error: "Unable to create your account right now."
    });
  }
});

// LOGIN
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

    req.user = { ...user, id: user.user_id };
    next();

  } catch (error) {
    return res.status(401).json({
      error: "Your session is invalid or has expired. Please log in again."
    });
  }
}

// --------------------------------------------------
// PROJECT LIST
// --------------------------------------------------

app.get("/api/projects", requireAuth, async (req, res) => {
  try {
    const projects = await loadProjects(req.user.user_id);

    const results = projects.map(project => ({
      ...project,
      r: calc(project, settings),
      history: project.history
    }));

    res.json(results);

  } catch (error) {
    console.error("Project loading error:", error);

    res.status(500).json({
      error: "Unable to load projects from the database."
    });
  }
});

// --------------------------------------------------
// SINGLE PROJECT
// --------------------------------------------------

app.get("/api/projects/:id", requireAuth, async (req, res) => {
  try {
    const projects = await loadProjects(req.user.user_id);

    const project = projects.find(
      item => String(item.id) === req.params.id
    );

    if (!project) {
      return res.status(404).json({
        error: "Project not found."
      });
    }

    res.json({
      ...project,
      r: calc(project, settings)
    });

  } catch (error) {
    console.error("Single project loading error:", error);

    res.status(500).json({
      error: "Unable to load this project."
    });
  }
});

// --------------------------------------------------
// ALERTS
// --------------------------------------------------

app.get("/api/alerts", requireAuth, async (req, res) => {
  try {
    const projects = await loadProjects(req.user.user_id);

    const rows = projects.map(project => ({
      p: project,
      r: calc(project, settings)
    }));

    res.json(buildAlerts(rows));

  } catch (error) {
    console.error("Alert loading error:", error);

    res.status(500).json({
      error: "Unable to load alerts."
    });
  }
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
// ASANA OAUTH ROUTES
app.use(
  "/api/asana",
  createAsanaRouter({
    requireAuth,
    saveOAuthState,
    consumeOAuthState,
    saveConnection
  })
);
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Pulse running at http://localhost:${PORT}`);

  startAsanaScheduler();
  console.log("Asana automatic sync scheduled every 5 minutes.");
});
