
require("dotenv").config();

const {
  getProjects,
  getProjectTasks,
  getTaskStories
} = require("./integrations/asana");

async function testAsana() {
  try {
    const token = process.env.ASANA_ACCESS_TOKEN;

    if (!token) {
      throw new Error("Missing ASANA_ACCESS_TOKEN");
    }

    const projects = await getProjects(token);

    console.log("Projects found:", projects.length);

    for (const project of projects) {
      console.log("\nProject:", project.name);

      const tasks = await getProjectTasks(token, project.gid);

      for (const task of tasks) {
        console.log("\nTask:", task.name);

        const stories = await getTaskStories(token, task.gid);

        console.log("Activity records:", stories.length);
        console.log(JSON.stringify(stories, null, 2));
      }
    }
  } catch (error) {
    console.error("Asana test failed:", error.message);
    process.exitCode = 1;
  }
}

testAsana();

