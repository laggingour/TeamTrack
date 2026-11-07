
require("dotenv").config();

const fs = require("fs");
const path = require("path");
const db = require("./db");

async function main() {
  try {
    const sql = fs.readFileSync(
      path.join(__dirname, "asana-oauth-migration.sql"),
      "utf8"
    );

    await db.query(sql);
    console.log("Asana OAuth migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
