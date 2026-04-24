require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function run() {
  const migrationPath = path.join(__dirname, '../../migrations/001_init.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('Migracao executada com sucesso.');
    process.exit(0);
  } catch (err) {
    console.error('Falha na migracao:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
