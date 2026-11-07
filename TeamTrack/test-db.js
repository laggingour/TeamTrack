
const pool = require('./db');

async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW()');

    console.log('SUCCESS! Connected to Neon PostgreSQL.');
    console.log('Database time:', result.rows[0].now);
  } catch (error) {
    console.error('Connection failed:', error.message);
  } finally {
    await pool.end();
  }
}

testConnection();
