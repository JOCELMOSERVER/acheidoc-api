require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function run() {
  try {
    const sqlPath = path.join(__dirname, '../../migrations/001_init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Migração executada com sucesso.');
    process.exit(0);
  } catch (err) {
    console.error('Falha na migração:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
