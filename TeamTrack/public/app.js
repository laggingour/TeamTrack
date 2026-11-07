
/*
  PULSE FRONTEND
  Handles login, dashboard, project details, alerts and settings.
*/

// --------------------------------------------------
// 1. SMALL HELPER FUNCTIONS
// --------------------------------------------------

const $ = (selector) => document.querySelector(selector);

const avg = (array) =>
  array.reduce((total, value) => total + value, 0) / array.length;

const pl = (number, word) =>
  number + " " + word + (number === 1 ? "" : "s");

// --------------------------------------------------
// 2. APPLICATION STATE
// --------------------------------------------------

const S = {
  user: sessionStorage.getItem("pulseUser"),
  token: sessionStorage.getItem("pulseToken"),

  th: { low: 70, med: 40 },

  read: new Set(),
  reviewed: new Set(),

  filter: "All",
  sort: "score",
  q: "",
  range: 30,
  afil: "All",

  prefs: {
    email: true,
    inapp: true,
    levels: {
      High: true,
      Medium: true,
      Low: false
    },
    qs: "18:00",
    qe: "20:00"
  }
};

// Project and alert information is loaded from the server.
let P = [];
let ALERTS = [];

// --------------------------------------------------
// 3. API CONNECTION
// --------------------------------------------------

async function api(url, options = {}) {
  const headers = {
    "Content-Type": "application/json"
  };

  const token = S.token || sessionStorage.getItem("pulseToken");

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body
      ? JSON.stringify(options.body)
      : undefined
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && token) {
      S.token = null;
      S.user = null;

      sessionStorage.removeItem("pulseToken");
      sessionStorage.removeItem("pulseUser");

      if (location.hash !== "#login") {
        location.hash = "login";
      }
    }

    throw new Error(
      result.error || "Something went wrong. Please try again."
    );
  }

  return result;
}

// --------------------------------------------------
// 4. LOAD DASHBOARD INFORMATION
// --------------------------------------------------

async function loadAll() {
  const [projects, alerts, settings] = await Promise.all([
    api("/api/projects"),
    api("/api/alerts"),
    api("/api/settings")
  ]);

  P = projects;

  S.th = {
    low: settings.low,
    med: settings.med
  };

  ALERTS = alerts.map((alert) => ({
    ...alert,
    p: P.find((project) => project.id === alert.projectId)
  })).filter((alert) => alert.p);
}

// --------------------------------------------------
// 5. RISK CLASSIFICATION
// --------------------------------------------------

function risk(score) {
  return score >= S.th.low
    ? "Low"
    : score >= S.th.med
      ? "Medium"
      : "High";
}

// The server calculates the project health score.
function calc(project) {
  return project.r;
}

function hist(project) {
  return project.history || [];
}

const R = () =>
  P.map((project) => ({
    p: project,
    r: calc(project)
  }));

// --------------------------------------------------
// 6. ALERT HELPERS
// --------------------------------------------------

function alerts() {
  return ALERTS.filter(
    (alert) => S.prefs.levels[alert.level]
  );
}

const unread = () =>
  alerts().filter((alert) => !S.read.has(alert.id)).length;

function bdg(level) {
  return `<span class="badge ${level}">
    ${level === "None" ? "Insufficient data" : level + " Risk"}
  </span>`;
}

function col(level) {
  return {
    Low: "var(--lc)",
    Medium: "var(--mc)",
    High: "var(--hc)"
  }[level];
}

// --------------------------------------------------
// 7. GENERAL DISPLAY HELPERS
// --------------------------------------------------

function toast(message) {
  const element = document.createElement("div");

  element.className = "toast";
  element.setAttribute("role", "status");
  element.textContent = message;

  document.body.append(element);

  setTimeout(() => element.remove(), 2600);
}

function shell(content, currentPage) {
  const count = unread();

  return `
    <header>
      <div class="bar">
        <a class="brand" href="#dashboard">Pulse</a>

        <nav aria-label="Main" style="display:flex;flex-wrap:wrap">
          <a href="#dashboard"
            ${currentPage === "d" ? 'aria-current="page"' : ""}>
            Dashboard
          </a>

          <a href="#alerts"
            ${currentPage === "a" ? 'aria-current="page"' : ""}>
            Alerts ${count ? `<span class="cnt">${count}</span>` : ""}
          </a>

          <a href="#settings"
            ${currentPage === "s" ? 'aria-current="page"' : ""}>
            Settings
          </a>

          <a href="#login" id="out">Sign out</a>
        </nav>
      </div>
    </header>

    <main>${content}</main>
  `;
}

// --------------------------------------------------
// 8. LOGIN SCREEN
// --------------------------------------------------

function login() {
  $("#app").innerHTML = `
    <main>
      <form class="card login" id="lf" novalidate>

        <h1>Pulse</h1>

        <p class="mu">
          Sign in to see which projects need attention
          before they slip.
        </p>

        <label for="em">Work email</label>

        <input
          id="em"
          type="email"
          autocomplete="username"
          placeholder="Enter your email"
          required
        >

        <label for="pw">Password</label>

        <input
          id="pw"
          type="password"
          autocomplete="current-password"
          placeholder="Enter your password"
          required
        >

        <div class="err" id="le" role="alert"></div>

        <button class="btn" style="width:100%">
          Sign in
        </button>
        <p style="text-align:center;margin-top:1rem">
        Don't have an account?
        <a href="#register">Sign up</a>
      </p>

      </form>
    </main>
  `;

  $("#lf").onsubmit = async (event) => {
    event.preventDefault();

    const email = $("#em").value.trim();
    const password = $("#pw").value;

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      $("#le").textContent =
        "Enter a valid work email, such as name@company.com.";
      return;
    }

    if (password.length < 8) {
      $("#le").textContent = "Invalid email or password.";
      return;
    }

    try {
      $("#le").textContent = "Signing in...";

      const result = await api("/api/login", {
        method: "POST",
        body: {
          email,
          password
        }
      });

      // Save the JWT token returned by the server.
      S.token = result.token;
      S.user = result.user.email;

      sessionStorage.setItem("pulseToken", result.token);
      sessionStorage.setItem("pulseUser", result.user.email);

      // Load dashboard information after login.
      await loadAll();

      location.hash = "dashboard";

    } catch (error) {
      S.token = null;
      S.user = null;

      sessionStorage.removeItem("pulseToken");
      sessionStorage.removeItem("pulseUser");

      $("#le").textContent = error.message;
    }
  };
}
function register() {
  $("#app").innerHTML = `
    <main>
      <form class="card login" id="rf" novalidate>
        <h1>Create your account</h1>

        <p class="mu">Join Pulse to monitor project health.</p>

        <label for="rn">Full name</label>
        <input
          id="rn"
          type="text"
          maxlength="100"
          placeholder="Enter your full name"
          required
        >

        <label for="re">Work email</label>
        <input
          id="re"
          type="email"
          maxlength="255"
          placeholder="Enter your email"
          required
        >

        <label for="rp">Password</label>
        <input
          id="rp"
          type="password"
          minlength="8"
          placeholder="At least 8 characters"
          required
        >

        <div class="err" id="re-error" role="alert"></div>

        <button class="btn" style="width:100%">
          Create account
        </button>

        <p style="text-align:center;margin-top:1rem">
          Already have an account?
          <a href="#login">Sign in</a>
        </p>
      </form>
    </main>
  `;

  $("#rf").onsubmit = async (event) => {
    event.preventDefault();

    const fullName = $("#rn").value.trim();
    const email = $("#re").value.trim();
    const password = $("#rp").value;
    const errorBox = $("#re-error");

    if (!fullName || !email || password.length < 8) {
      errorBox.textContent =
        "Enter your name, a valid email and a password of at least 8 characters.";
      return;
    }

    try {
      errorBox.textContent = "Creating your account...";

      const result = await api("/api/register", {
        method: "POST",
        body: { fullName, email, password }
      });

      S.token = result.token;
      S.user = result.user.email;

      sessionStorage.setItem("pulseToken", result.token);
      sessionStorage.setItem("pulseUser", result.user.email);

      await loadAll();

      location.hash = "dashboard";

    } catch (error) {
      errorBox.textContent = error.message;
    }
  };
}

// --------------------------------------------------
// 9. DASHBOARD SCREEN
// --------------------------------------------------

function dash() {
  let projectRows = R().filter(({ p, r }) => {
    const matchesRisk =
      S.filter === "All" ||
      (S.filter === "Insufficient"
        ? r.status !== "OK"
        : r.risk === S.filter);

    const matchesSearch =
      p.name.toLowerCase().includes(S.q.toLowerCase());

    return matchesRisk && matchesSearch;
  });

  projectRows.sort((a, b) => {
    return S.sort === "name"
      ? a.p.name.localeCompare(b.p.name)
      : (a.r.score ?? 101) - (b.r.score ?? 101);
  });

  const cards = projectRows.map(({ p, r }) => {
    const hasScore = r.status === "OK";
    const level = hasScore ? r.risk : "None";

    return `
      <a class="card pc" href="#project-${p.id}">
        <div class="row">
          <h3>${p.name}</h3>
        </div>

        <div class="mu">
          ${p.dept} · ${pl(p.m.length, "member")}
        </div>

        <div class="row" style="margin:.8rem 0">
          <span class="big">${hasScore ? r.score : "–"}</span>
          ${bdg(level)}
        </div>

        <div class="bd" aria-hidden="true">
          <i style="
            width:${hasScore ? r.score : 0}%;
            background:${col(level)}
          "></i>
        </div>

        <div class="mu" style="margin-top:.5rem">
          Last Asana activity: ${p.last}
        </div>
      </a>
    `;
  }).join("");

  const count = (level) =>
    R().filter(({ r }) =>
      level === "All"
        ? true
        : level === "Insufficient"
          ? r.status !== "OK"
          : r.risk === level
    ).length;

  $("#app").innerHTML = shell(`
    <h1>Project portfolio</h1>

    <p class="mu">
      Health scores refresh after every 15-minute Asana sync.
    </p>

    <div class="tools">

      <input
        type="search"
        id="q"
        placeholder="Search projects"
        aria-label="Search projects"
        value="${S.q}"
      >

      ${["All", "High", "Medium", "Low", "Insufficient"]
        .map((level) => `
          <button
            class="chip"
            data-f="${level}"
            aria-pressed="${S.filter === level}"
          >
            ${level === "Insufficient" ? "No data" : level}
            (${count(level)})
          </button>
        `).join("")}

      <select id="so" aria-label="Sort projects">
        <option value="score"
          ${S.sort === "score" ? "selected" : ""}>
          Sort: lowest score first
        </option>

        <option value="name"
          ${S.sort === "name" ? "selected" : ""}>
          Sort: name
        </option>
      </select>

    </div>

    ${cards
      ? `<div class="grid">${cards}</div>`
      : `<div class="card">
          No projects match. Clear the search or choose another risk filter.
        </div>`
    }
  `, "d");

  $("#q").oninput = (event) => {
    S.q = event.target.value;
    dash();

    $("#q").focus();
    $("#q").setSelectionRange(S.q.length, S.q.length);
  };

  document.querySelectorAll("[data-f]").forEach((button) => {
    button.onclick = () => {
      S.filter = button.dataset.f;
      dash();
    };
  });

  $("#so").onchange = (event) => {
    S.sort = event.target.value;
    dash();
  };
}

// --------------------------------------------------
// 10. PROJECT TREND CHART
// --------------------------------------------------

function chart(history, numberOfDays) {
  const data = history.slice(-numberOfDays);

  if (!data.length) {
    return "<p>No trend information available.</p>";
  }

  const width = 600;
  const height = 200;

  const x = (index) =>
    data.length === 1
      ? width / 2
      : 20 + index * (width - 30) / (data.length - 1);

  const y = (value) =>
    height - 15 - value * (height - 30) / 100;

  return `
    <svg
      viewBox="0 0 ${width} ${height}"
      width="100%"
      role="img"
      aria-label="Project health score trend"
    >

      ${[
        [S.th.low, "var(--lc)"],
        [S.th.med, "var(--hc)"]
      ].map(([value, colour]) => `
        <line
          x1="20"
          x2="${width - 10}"
          y1="${y(value)}"
          y2="${y(value)}"
          stroke="${colour}"
          stroke-dasharray="5 4"
        />

        <text
          x="${width - 10}"
          y="${y(value) - 4}"
          text-anchor="end"
          font-size="11"
          fill="var(--mu)"
        >${value}</text>
      `).join("")}

      <polyline
        fill="none"
        stroke="var(--nv)"
        stroke-width="3"
        stroke-linejoin="round"
        points="${data.map((value, index) =>
          x(index) + "," + y(value)
        ).join(" ")}"
      />

      <circle
        cx="${x(data.length - 1)}"
        cy="${y(data[data.length - 1])}"
        r="5"
        fill="var(--nv)"
      />

    </svg>
  `;
}

// --------------------------------------------------
// 11. PROJECT DETAIL SCREEN
// --------------------------------------------------

function detail(id) {
  const project = P.find((item) => item.id == id);

  if (!project) {
    location.hash = "dashboard";
    return;
  }

  const result = calc(project);

  if (result.status !== "OK") {
    $("#app").innerHTML = shell(`
      <a href="#dashboard">Back to portfolio</a>

      <h1 style="margin-top:.5rem">${project.name}</h1>

      <div class="card" style="margin-top:1rem">
        ${bdg("None")}

        <p>
          Insufficient data: awaiting first Asana sync.
          Scores appear once the project has tasks and activity
          from the past 7 days.
        </p>

        <button class="btn" id="sy">Sync now</button>
      </div>
    `, "d");

    $("#sy").onclick = () =>
      toast("Sync requested. Check back in a few minutes.");

    return;
  }

  const history = hist(project);
  const topFactor = result.weak[0];

  const reviewed = S.reviewed.has(project.id);

  const projectAlerts = alerts().filter(
    (alert) => alert.p.id === project.id
  );

  $("#app").innerHTML = shell(`
    <a href="#dashboard">Back to portfolio</a>

    <div class="row" style="margin:.5rem 0 1rem;flex-wrap:wrap">

      <div>
        <h1>${project.name}</h1>

        <span class="mu">
          ${project.dept} · ${pl(project.m.length, "member")}
          · Last Asana activity ${project.last}
        </span>
      </div>

      <div class="row">
        <span class="big">${result.score}</span>
        ${bdg(result.risk)}
      </div>

    </div>

    <div class="two">

      <section class="card">

        <h2>Why this score</h2>

        ${result.weak.length
          ? `
            <ul style="padding-left:1.1rem;margin:0">
              ${result.weak.map((factor) => `
                <li>
                  <strong>${factor.k}</strong>
                  (${Math.round(factor.v)}/100):
                  ${factor.why}
                </li>
              `).join("")}
            </ul>
          `
          : "<p>No factor is below the warning level. This project is healthy.</p>"
        }

        <h2 style="margin-top:1rem">Recommended actions</h2>

        <ul style="padding-left:1.1rem;margin:0">
          ${(result.weak.length
            ? result.weak
            : [{ rec: "Keep the current cadence and review again next week" }]
          ).map((factor) => `
            <li>${factor.rec}</li>
          `).join("")}
        </ul>

        <div class="tools">
          <button class="btn" id="mt">Message team</button>
          <button class="btn alt" id="sa">Request stand-up</button>
          <button class="btn alt" id="rv">
            ${reviewed ? "Reviewed ✓" : "Mark reviewed"}
          </button>
          <button class="btn alt" id="sy">Sync now</button>
        </div>

        <div id="mb"></div>

      </section>

      <section class="card">

        <div class="row">
          <h2>Score trend</h2>

          <span>
            ${[7, 14, 30].map((days) => `
              <button
                class="chip"
                data-r="${days}"
                aria-pressed="${S.range === days}"
              >
                ${days} days
              </button>
            `).join(" ")}
          </span>
        </div>

        ${chart(history, S.range)}

        <p class="mu">
          Dashed lines show the Low (≥${S.th.low})
          and Medium (≥${S.th.med}) thresholds.
        </p>

      </section>

    </div>

    <section class="card" style="margin-top:1rem">

      <h2>Score breakdown</h2>

      <div class="stack">
        ${result.F.map((factor) => `
          <div>

            <div class="row">
              <span>
                ${factor.k}
                <span class="mu">
                  (weight ${Math.round(factor.w * 100)}%)
                </span>
              </span>

              <strong>${Math.round(factor.v)}</strong>
            </div>

            <div class="bd" aria-hidden="true">
              <i style="
                width:${factor.v}%;
                background:${
                  factor.v < 40
                    ? "var(--hc)"
                    : factor.v < 60
                      ? "var(--mc)"
                      : "var(--lc)"
                }
              "></i>
            </div>

          </div>
        `).join("")}
      </div>

      <p class="formula">
        Health score = Task completion × 0.30 +
        Overdue tasks × 0.25 +
        Member activity × 0.20 +
        Workload equity × 0.15 +
        Communication × 0.10
      </p>

    </section>

    <div class="two" style="margin-top:1rem">

      <section class="card">

        <h2>Task completion</h2>

        <div class="row">
          <span>${project.done} of ${project.total} done</span>

          <span>
            ${Math.round(project.done / project.total * 100)}%
          </span>
        </div>

        <div class="bd" aria-hidden="true">
          <i style="
            width:${project.done / project.total * 100}%;
            background:var(--nv)
          "></i>
        </div>

        <p class="mu">
          Overdue:
          ${project.od.length
            ? project.od.map((days) => pl(days, "day") + " late").join(", ")
            : "none"
          }
        </p>

      </section>

      <section class="card">

        <h2>Team activity</h2>

        <div class="scroll">
          <table>

            <tr>
              <th>Member</th>
              <th>Last action</th>
              <th>Share of work</th>
            </tr>

            ${project.m.map((member) => `
              <tr>
                <td>${member[0]}</td>

                <td>
                  ${member[1] === 0
                    ? "Today"
                    : pl(member[1], "day") + " ago"
                  }
                  ${member[1] > 5 ? " ⚠" : ""}
                </td>

                <td>
                  ${project.done
                    ? Math.round(member[2] / project.done * 100)
                    : 0
                  }%
                </td>
              </tr>
            `).join("")}

          </table>
        </div>

      </section>

    </div>

    <section class="card" style="margin-top:1rem">

      <h2>Alert history</h2>

      ${projectAlerts.length
        ? projectAlerts.map((alert) => `
            <p style="margin:.3rem 0">
              ${bdg(alert.level)}
              ${alert.text}
              <span class="mu">${alert.t} h ago</span>
            </p>
          `).join("")
        : "<p>No alerts for this project.</p>"
      }

    </section>
  `, "d");

  document.querySelectorAll("[data-r]").forEach((button) => {
    button.onclick = () => {
      S.range = Number(button.dataset.r);
      detail(id);
    };
  });

  $("#rv").onclick = () => {
    S.reviewed.add(project.id);
    detail(id);
    toast("Project marked as reviewed");
  };

  $("#sy").onclick = () =>
    toast("Sync requested. Scores update when it finishes.");

  const showMessage = (title, message) => {
    $("#mb").innerHTML = `
      <label for="mx">${title}</label>

      <textarea
        id="mx"
        rows="4"
        style="width:100%"
      >${message}</textarea>

      <button class="btn" id="sd" style="margin-top:.5rem">
        Send message
      </button>
    `;

    $("#sd").onclick = () => {
      $("#mb").innerHTML = "";
      toast("Message sent to " + pl(project.m.length, "team member"));
    };
  };

  $("#mt").onclick = () => {
    showMessage(
      "Message to team",
      topFactor
        ? `${topFactor.why.toLowerCase()}. Can we sync today on what's blocking progress?`
        : "Great progress so far. Keep it up."
    );
  };

  $("#sa").onclick = () => {
    showMessage(
      "Stand-up request",
      "Hi team, let's hold a 15-minute stand-up tomorrow to review blockers and overdue tasks."
    );
  };
}

// --------------------------------------------------
// 12. ALERTS SCREEN
// --------------------------------------------------

function alertsPage() {
  const allAlerts = alerts();

  const shownAlerts = allAlerts.filter(
    (alert) =>
      S.afil === "All" || alert.level === S.afil
  );

  $("#app").innerHTML = shell(`
    <div class="row">
      <h1>Alerts</h1>

      <button class="btn alt" id="ma">
        Mark all as read
      </button>
    </div>

    <div class="tools">
      ${["All", "High", "Medium", "Low"].map((level) => `
        <button
          class="chip"
          data-a="${level}"
          aria-pressed="${S.afil === level}"
        >
          ${level}
        </button>
      `).join("")}
    </div>

    <div class="stack">

      ${shownAlerts.length
        ? shownAlerts.map((alert) => `
          <div
            class="card al ${S.read.has(alert.id) ? "" : "unread"}"
            style="border-left-color:${col(alert.level)}"
            tabindex="0"
            role="link"
            data-id="${alert.id}"
            data-p="${alert.p.id}"
          >

            <div>

              <div class="row" style="gap:.8rem;justify-content:flex-start">

                ${bdg(alert.level)}

                <strong>${alert.p.name}</strong>

                ${S.read.has(alert.id)
                  ? ""
                  : '<span class="cnt" style="background:var(--nv);color:var(--nvt)">New</span>'
                }

              </div>

              <div>${alert.text} · score ${alert.score}</div>

              <div class="mu">${alert.t} hours ago</div>

            </div>

          </div>
        `).join("")
        : `
          <div class="card">
            No alerts yet. You're all caught up.
          </div>
        `
      }

    </div>
  `, "a");

  document.querySelectorAll("[data-a]").forEach((button) => {
    button.onclick = () => {
      S.afil = button.dataset.a;
      alertsPage();
    };
  });

    $("#ma").onclick = () => {
     allAlerts.forEach((alert) => S.read.add(alert.id));

     localStorage.setItem(
    "pulseReadAlerts",
    JSON.stringify([...S.read])
     );

  alertsPage();
  toast("All alerts marked as read");
    };

  document.querySelectorAll(".al").forEach((element) => {
    const go = () => {
  S.read.add(element.dataset.id);

  localStorage.setItem(
    "pulseReadAlerts",
    JSON.stringify([...S.read])
  );

  location.hash = "project-" + element.dataset.p;
};
    element.onclick = go;

    element.onkeydown = (event) => {
      if (event.key === "Enter") {
        go();
      }
    };
  });
}

// --------------------------------------------------
// 13. SETTINGS SCREEN
// --------------------------------------------------

function settings() {
  const preferences = S.prefs;

  $("#app").innerHTML = shell(`
    <h1>Settings</h1>

    <form id="sf" class="stack" style="margin-top:1rem" novalidate>

      <section class="card">

        <h2>Notifications</h2>

        <label>
          <input type="checkbox" id="e1"
            ${preferences.email ? "checked" : ""}>
          Email alerts
        </label>

        <label>
          <input type="checkbox" id="e2"
            ${preferences.inapp ? "checked" : ""}>
          In-app alerts
        </label>

        <p class="mu" style="margin-bottom:0">
          Alert me for these risk levels
        </p>

        ${["High", "Medium", "Low"].map((level) => `
          <label>
            <input
              type="checkbox"
              data-l="${level}"
              ${preferences.levels[level] ? "checked" : ""}
            >
            ${level} risk
          </label>
        `).join("")}

        <div class="two">

          <div>
            <label for="qs">Quiet hours start</label>
            <input type="time" id="qs" value="${preferences.qs}">
          </div>

          <div>
            <label for="qe">Quiet hours end</label>
            <input type="time" id="qe" value="${preferences.qe}">
          </div>

        </div>

      </section>

      <section class="card">

        <h2>Risk thresholds</h2>

        <div class="two">

          <div>
            <label for="tl">Low risk at or above</label>
            <input
              type="number"
              id="tl"
              min="1"
              max="100"
              value="${S.th.low}"
            >
          </div>

          <div>
            <label for="tm">Medium risk at or above</label>
            <input
              type="number"
              id="tm"
              min="1"
              max="99"
              value="${S.th.med}"
            >
          </div>

        </div>

        <p class="mu">
          Scores on every screen re-evaluate against these thresholds.
        </p>

      </section>

      <section class="card">

        <h2>Asana connection</h2>
        <p>
       Connect your Asana account to import projects
       and tasks into Pulse.
       </p>

     <p>
      Automatic synchronisation runs every 5 minutes.
      </p>

      <button type="button" class="btn alt" id="rc">
      Connect Asana
     </button>


      </section>

      <div class="err" id="se" role="alert"></div>

      <button class="btn">Save changes</button>

    </form>
  `, "s");

    $("#rc").onclick = async () => {
    try {
    const result = await api("/api/asana/connect");

    if (!result.authorizationUrl) {
      throw new Error("Asana authorization URL was not returned");
    }

    window.location.assign(result.authorizationUrl);
  } catch (error) {
    toast(error.message || "Unable to connect Asana");
  }
};

  $("#sf").onsubmit = async (event) => {
    event.preventDefault();

    const low = Number($("#tl").value);
    const med = Number($("#tm").value);

    if ($("#qe").value <= $("#qs").value) {
      $("#se").textContent =
        "Quiet hours must end after they start.";
      return;
    }

    if (!(med < low && low <= 100 && med >= 1)) {
      $("#se").textContent =
        "The Medium threshold must be lower than the Low threshold.";
      return;
    }

    preferences.email = $("#e1").checked;
    preferences.inapp = $("#e2").checked;

    preferences.qs = $("#qs").value;
    preferences.qe = $("#qe").value;

    document.querySelectorAll("[data-l]").forEach((checkbox) => {
      preferences.levels[checkbox.dataset.l] = checkbox.checked;
    });

    $("#se").textContent = "";

    try {
      await api("/api/settings", {
        method: "PUT",
        body: { low, med }
      });

      await loadAll();

      toast("Settings saved");
      settings();

    } catch (error) {
      $("#se").textContent = error.message;
    }
  };
}

// --------------------------------------------------
// 14. PAGE ROUTER
// --------------------------------------------------

function route() {
  const page = location.hash.slice(1) || "login";

  // Registration is available without logging in.
  if (page === "register") {
    register();
    return;
  }

  // Signing out clears the saved login session.
  if (page === "login") {
    S.user = null;
    S.token = null;

    sessionStorage.removeItem("pulseToken");
    sessionStorage.removeItem("pulseUser");

    login();
    return;
  }

  // Users without a login session cannot access the dashboard.
  if (!S.user || !S.token) {
    location.hash = "login";
    return;
  }

  if (page === "dashboard") {
    dash();
  } else if (page === "alerts") {
    alertsPage();
  } else if (page === "settings") {
    settings();
  } else if (page.startsWith("project-")) {
    detail(page.slice(8));
  } else {
    location.hash = "dashboard";
  }

  window.scrollTo(0, 0);
}

// --------------------------------------------------
// 15. RESTORE LOGIN SESSION WHEN THE APP OPENS
// --------------------------------------------------

addEventListener("hashchange", route);

async function startApp() {
  if (S.token && S.user) {
    try {
      // Check the saved token by requesting protected information.
      await loadAll();

      if (!location.hash || location.hash === "#login") {
        location.hash = "dashboard";
      } else {
        route();
      }

    } catch (error) {
      S.token = null;
      S.user = null;

      sessionStorage.removeItem("pulseToken");
      sessionStorage.removeItem("pulseUser");

      location.hash = "login";
      login();
    }

  } else {
    route();
  }
}
// Restore alerts marked as read after refreshing
try {
  S.read = new Set(
    JSON.parse(localStorage.getItem("pulseReadAlerts") || "[]")
  );
} catch (error) {
  S.read = new Set();
}
// Restore alerts marked as read after refreshing
try {
  S.read = new Set(
    JSON.parse(localStorage.getItem("pulseReadAlerts") || "[]")
  );
} catch (error) {
  S.read = new Set();
}
// Restore alerts marked as read after refreshing
try {
  S.read = new Set(
    JSON.parse(localStorage.getItem("pulseReadAlerts") || "[]")
    );
    } catch (error) {
  S.read = new Set();
}
// Restore alerts marked as read after refreshing
try {
     S.read = new Set(
    JSON.parse(localStorage.getItem("pulseReadAlerts") || "[]")
     );
      } catch (error) {
      S.read = new Set();
         }

startApp();


