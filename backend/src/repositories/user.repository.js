/**
 * User Repository - PostgreSQL Data Access Layer
 * 
 * Handles all database operations for users
 */

const db = require('../config/database');

class UserRepository {
  /**
   * Find user by ID
   * @param {string} userId - User UUID
   * @returns {Promise<Object|null>} - User object or null
   */
  async findById(userId) {
    const query = `
      SELECT 
        id,
        email,
        username,
        full_name,
        phone,
        is_verified,
        is_active,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
  }

  /**
   * Find user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} - User object or null
   */
  async findByEmail(email) {
    const query = `
      SELECT 
        id,
        email,
        username,
        password_hash,
        full_name,
        is_verified,
        is_active,
        created_at
      FROM users
      WHERE email = $1
    `;

    const result = await db.query(query, [email]);
    return result.rows[0] || null;
  }

  /**
   * Find user by username
   * @param {string} username - Username
   * @returns {Promise<Object|null>} - User object or null
   */
  async findByUsername(username) {
    const query = `
      SELECT 
        id,
        email,
        username,
        full_name,
        is_verified,
        is_active,
        created_at
      FROM users
      WHERE username = $1
    `;

    const result = await db.query(query, [username]);
    return result.rows[0] || null;
  }

  /**
   * Create a new user
   * @param {Object} userData - User data
   * @returns {Promise<Object>} - Created user
   */
  async create(userData) {
    const query = `
      INSERT INTO users (
        email,
        username,
        password_hash,
        full_name,
        phone
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, username, full_name, created_at
    `;

    const params = [
      userData.email,
      userData.username,
      userData.password_hash,
      userData.full_name || null,
      userData.phone || null
    ];

    const result = await db.query(query, params);
    return result.rows[0];
  }
  /**
   * Update user profile
   * @param {string} userId - User UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} - Updated user
   */
  async update(userId, updates) {
    const fields = [];
    const params = [];
    let paramIndex = 1;

    // Build dynamic UPDATE query
    Object.keys(updates).forEach(key => {
      fields.push(`${key} = $${paramIndex}`);
      params.push(updates[key]);
      paramIndex++;
    });

    // Add user ID as last parameter
    params.push(userId);

    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, email, username, full_name, phone, updated_at
    `;

    const result = await db.query(query, params);
    return result.rows[0] || null;
  }
}

module.exports = new UserRepository();
