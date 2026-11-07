
const {
  getProjects,
  getProjectTasks,
  getTaskStories
} = require("./asana");

// Convert Asana task into database-ready information
function mapTask(task, projectGid) {
  return {
    asana_task_id: task.gid,
    asana_project_id: projectGid,
    task_name: task.name,
    description: task.notes || "",
    status: task.completed ? "completed" : "incomplete",
    due_date: task.due_on || null,
    completed_at: task.completed_at || null,
    asana_assignee_id: task.assignee?.gid || null,
    asana_assignee_name: task.assignee?.name || null
  };
}

// Convert Asana project into database-ready information
function mapProject(project) {
  return {
    asana_project_id: project.gid,
    project_name: project.name,
    description: project.notes || "",
    status: project.archived ? "archived" : "active",
    end_date: project.due_on || null
  };
}

// Convert Asana activity into database-ready information
function mapActivity(story, taskGid) {
  return {
    asana_story_id: story.gid,
    asana_task_id: taskGid,
    activity_type: story.type,
    description: story.text || "",
    created_at: story.created_at || null,
    asana_actor_id: story.created_by?.gid || null,
    asana_actor_name: story.created_by?.name || null
  };
}

// Fetch all data without writing to the database
async function collectAsanaData(accessToken) {
  if (!accessToken) {
    throw new Error("Asana access token is required");
  }

  const projects = await getProjects(accessToken);
  const result = [];

  for (const project of projects) {
    const tasks = await getProjectTasks(accessToken, project.gid);
    const mappedTasks = [];
    const activities = [];

    for (const task of tasks) {
      mappedTasks.push(mapTask(task, project.gid));

      const stories = await getTaskStories(accessToken, task.gid);

      for (const story of stories) {
        activities.push(mapActivity(story, task.gid));
      }
    }

    result.push({
      project: mapProject(project),
      tasks: mappedTasks,
      activities
    });
  }

  return result;
}

module.exports = {
  mapProject,
  mapTask,
  mapActivity,
  collectAsanaData
};
