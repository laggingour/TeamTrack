
const API_BASE = "https://app.asana.com/api/1.0";

// Make an authenticated request to Asana
async function asanaRequest(accessToken, endpoint, params = {}) {
  if (!accessToken) {
    throw new Error("Asana access token is required");
  }

  const url = new URL(API_BASE + endpoint);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const details = await response.text();

    // Avoid printing potentially sensitive API response data
    console.error("Asana API request failed:", {
      status: response.status,
      endpoint
    });

    const error = new Error(
      `Asana API request failed (${response.status}): ${details.slice(0, 500)}`
    );

    error.status = response.status;
    error.retryAfter = response.headers.get("retry-after");

    throw error;
  }

  return response.json();
}

// Retrieve all pages of Asana results
async function getAllPages(accessToken, endpoint, params = {}) {
  const results = [];
  let offset;

  do {
    const response = await asanaRequest(accessToken, endpoint, {
      ...params,
      limit: 100,
      ...(offset ? { offset } : {})
    });

    if (!Array.isArray(response.data)) {
      throw new Error("Unexpected Asana response format");
    }

    results.push(...response.data);
    offset = response.next_page?.offset;
  } while (offset);

  return results;
}

// Get workspaces accessible to the user
async function getWorkspaces(accessToken) {
  return getAllPages(accessToken, "/workspaces", {
    opt_fields: "gid,name"
  });
}

// Get projects from all accessible workspaces
async function getProjects(accessToken) {
  const workspaces = await getWorkspaces(accessToken);
  const projects = [];

  for (const workspace of workspaces) {
    const workspaceProjects = await getAllPages(
      accessToken,
      "/projects",
      {
        workspace: workspace.gid,
        opt_fields: "gid,name,notes,archived,due_on"
      }
    );

    projects.push(...workspaceProjects);
  }

  return projects;
}

// Get tasks belonging to a specific project
async function getProjectTasks(accessToken, projectGid) {
  if (!projectGid) {
    throw new Error("Project GID is required");
  }

  return getAllPages(
    accessToken,
    `/projects/${encodeURIComponent(projectGid)}/tasks`,
    {
      opt_fields: [
        "gid",
        "name",
        "notes",
        "completed",
        "completed_at",
        "due_on",
        "due_at",
        "created_at",
        "modified_at",
        "assignee.gid",
        "assignee.name"
      ].join(",")
    }
  );
}

// Get activity and comments for a task
async function getTaskStories(accessToken, taskGid) {
  if (!taskGid) {
    throw new Error("Task GID is required");
  }

  return getAllPages(
    accessToken,
    `/tasks/${encodeURIComponent(taskGid)}/stories`,
    {
      opt_fields: [
        "gid",
        "text",
        "type",
        "created_at",
        "created_by.gid",
        "created_by.name"
      ].join(",")
    }
  );
}

// Export functions for use in server.js and test files
module.exports = {
  asanaRequest,
  getAllPages,
  getWorkspaces,
  getProjects,
  getProjectTasks,
  getTaskStories
};
