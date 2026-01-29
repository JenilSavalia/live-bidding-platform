/**
 * Database Migration Script
 * 
 * Runs the initial schema migration on NeonDB or any PostgreSQL database
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
    // Create client with connection string or individual params
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
        // Fallback to individual params if no connection string
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT,
        database: process.env.POSTGRES_DB,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD
    });

    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('Connected successfully!');

        // Read migration file
        const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '001_initial_schema.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('Running migration...');
        await client.query(migrationSQL);
        console.log('Migration completed successfully!');

        // Verify tables were created
        const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

        console.log('\nCreated tables:');
        result.rows.forEach(row => {
            console.log(`  ✓ ${row.table_name}`);
        });

    } catch (error) {
        console.error('Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await client.end();
        console.log('\nDatabase connection closed.');
    }
}

// Run migration
runMigration();
