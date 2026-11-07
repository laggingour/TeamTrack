
const pool = require("../db");

// Save or update an Asana project
async function saveProject(client, project, userId) {
  if (!userId) {
    throw new Error("User ID is required to save Asana projects");
  }

  const result = await client.query(
    `INSERT INTO projects
      (asana_project_id, project_name, description, status, end_date, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (asana_project_id)
       WHERE asana_project_id IS NOT NULL
     DO UPDATE SET
       project_name = EXCLUDED.project_name,
       description = EXCLUDED.description,
       status = EXCLUDED.status,
       end_date = EXCLUDED.end_date,
       owner_id = COALESCE(projects.owner_id, EXCLUDED.owner_id),
       updated_at = CURRENT_TIMESTAMP
     RETURNING project_id`,
    [
      project.asana_project_id,
      project.project_name,
      project.description,
      project.status,
      project.end_date,
      userId
    ]
  );

  return result.rows[0].project_id;
}

// Save or update an Asana task
async function saveTask(client, task, projectId) {
  const result = await client.query(
    `INSERT INTO tasks
      (project_id, asana_task_id, task_name, description,
       status, due_date, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (project_id, asana_task_id)
     DO UPDATE SET
       task_name = EXCLUDED.task_name,
       description = EXCLUDED.description,
       status = EXCLUDED.status,
       due_date = EXCLUDED.due_date,
       completed_at = EXCLUDED.completed_at,
       updated_at = CURRENT_TIMESTAMP
     RETURNING task_id`,
    [
      projectId,
      task.asana_task_id,
      task.task_name,
      task.description,
      task.status,
      task.due_date,
      task.completed_at
    ]
  );

  return result.rows[0].task_id;
}

// Save activity without creating duplicates
async function saveActivity(client, activity, projectId, taskId) {
  await client.query(
    `INSERT INTO activity_logs
      (project_id, task_id, asana_story_id,
       activity_type, description, activity_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (asana_story_id)
       WHERE asana_story_id IS NOT NULL
     DO NOTHING`,
    [
      projectId,
      taskId,
      activity.asana_story_id,
      activity.activity_type || "comment",
      activity.description,
      activity.created_at
    ]
  );
}

// Save all collected Asana data
async function saveAsanaData(data, userId) {
  if (!userId) {
    throw new Error("User ID is required for Asana sync");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let projectCount = 0;
    let taskCount = 0;
    let activityCount = 0;

    for (const item of data) {
      const projectId = await saveProject(
        client,
        item.project,
        userId
      );

      projectCount++;

      const taskIds = new Map();

      for (const task of item.tasks) {
        const taskId = await saveTask(
          client,
          task,
          projectId
        );

        taskIds.set(task.asana_task_id, taskId);
        taskCount++;
      }

      for (const activity of item.activities) {
        const taskId = taskIds.get(
          activity.asana_task_id
        );

        if (!taskId) continue;

        await saveActivity(
          client,
          activity,
          projectId,
          taskId
        );

        activityCount++;
      }
    }

    await client.query("COMMIT");

    return {
      projectsProcessed: projectCount,
      tasksProcessed: taskCount,
      activitiesProcessed: activityCount
    };

  } catch (error) {
    await client.query("ROLLBACK");
    throw error;

  } finally {
    client.release();
  }
}

module.exports = {
  saveAsanaData
};
