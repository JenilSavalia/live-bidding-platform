/**
 * PostgreSQL Database Connection Pool
 * 
 * Manages database connections using pg Pool for connection pooling
 */

const { Pool } = require('pg');
const config = require('./index');

// Create connection pool
const pool = new Pool({
    connectionString: config.postgres.host,
});

// Handle pool errors
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

// Test connection on startup
pool.on('connect', () => {
    console.log('PostgreSQL connected');
});

/**
 * Execute a query
 * @param {string} text - SQL query
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} - Query result
 */
const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Executed query', { text, duration, rows: result.rowCount });
        return result;
    } catch (error) {
        console.error('Database query error:', error);
        throw error;
    }
};

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Object>} - Pool client
 */
const getClient = async () => {
    const client = await pool.connect();
    const query = client.query;
    const release = client.release;

    // Set a timeout of 5 seconds, after which we will log this client's last query
    const timeout = setTimeout(() => {
        console.error('A client has been checked out for more than 5 seconds!');
        console.error(`The last executed query on this client was: ${client.lastQuery}`);
    }, 5000);

    // Monkey patch the query method to keep track of the last query executed
    client.query = (...args) => {
        client.lastQuery = args;
        return query.apply(client, args);
    };

    client.release = () => {
        // Clear timeout
        clearTimeout(timeout);
        // Set the methods back to their old un-monkey-patched version
        client.query = query;
        client.release = release;
        return release.apply(client);
    };

    return client;
};

/**
 * Close the pool (for graceful shutdown)
 */
const close = async () => {
    await pool.end();
    console.log('PostgreSQL pool closed');
};

module.exports = {
    query,
    getClient,
    close,
    pool
};
