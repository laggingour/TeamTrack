
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function createTables() {
  try {
    const schema = fs.readFileSync(
      path.join(__dirname, 'schema.sql'),
      'utf8'
    );

    await pool.query(schema);

    console.log('SUCCESS! Users table created in PostgreSQL.');
  } catch (error) {
    console.error('Could not create table:', error.message);
  } finally {
    await pool.end();
  }
}

createTables();
