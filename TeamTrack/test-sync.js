
require("dotenv").config();

const {
  collectAsanaData
} = require("./integrations/sync");

async function testSync() {
  try {
    const token = process.env.ASANA_ACCESS_TOKEN;

    if (!token) {
      throw new Error("ASANA_ACCESS_TOKEN is missing");
    }

    const data = await collectAsanaData(token);

    console.log("Asana data collection successful!");

    console.log("Projects:", data.length);

    for (const item of data) {
      console.log("\nProject:", item.project.project_name);
      console.log("Tasks:", item.tasks.length);
      console.log("Activity records:", item.activities.length);
    }
  } catch (error) {
    console.error("Sync test failed:", error.message);
    process.exitCode = 1;
  }
}

testSync();
