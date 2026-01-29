/**
 * User Service - Business Logic for User Operations
 * 
 * Handles user registration, authentication, and profile management
 */

const bcrypt = require('bcrypt');
const userRepository = require('../repositories/user.repository');
const { generateToken } = require('../middleware/auth');
const { AppError } = require('../middleware/error');

const SALT_ROUNDS = 10;

class UserService {
    /**
     * Register a new user
     * @param {Object} userData - User registration data
     * @returns {Promise<Object>} - Created user with token
     */
    async register(userData) {
        const { email, username, password, full_name, phone } = userData;

        // Check if email already exists
        const existingEmail = await userRepository.findByEmail(email);
        if (existingEmail) {
            throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
        }

        // Check if username already exists
        const existingUsername = await userRepository.findByUsername(username);
        if (existingUsername) {
            throw new AppError('Username already taken', 409, 'USERNAME_EXISTS');
        }

        // Hash password
        const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        const user = await userRepository.create({
            email,
            username,
            password_hash,
            full_name,
            phone
        });

        // Generate JWT token
        const token = generateToken(user);

        return {
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                full_name: user.full_name,
                created_at: user.created_at
            },
            token
        };
    }

    /**
     * Authenticate user and return token
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<Object>} - User with token
     */
    async login(email, password) {
        // Find user by email
        const user = await userRepository.findByEmail(email);

        if (!user) {
            throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
        }

        // Check if user is active
        if (!user.is_active) {
            throw new AppError('Account is disabled', 403, 'ACCOUNT_DISABLED');
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);

        if (!isPasswordValid) {
            throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
        }

        // Generate JWT token
        const token = generateToken(user);

        return {
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                full_name: user.full_name,
                is_verified: user.is_verified
            },
            token
        };
    }

    /**
     * Get user by ID
     * @param {string} userId - User UUID
     * @returns {Promise<Object>} - User object
     */
    async getUserById(userId) {
        const user = await userRepository.findById(userId);

        if (!user) {
            throw new AppError('User not found', 404, 'USER_NOT_FOUND');
        }

        return {
            id: user.id,
            email: user.email,
            username: user.username,
            full_name: user.full_name,
            phone: user.phone,
            is_verified: user.is_verified,
            created_at: user.created_at
        };
    }

    /**
     * Update user profile
     * @param {string} userId - User UUID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} - Updated user
     */
    async updateUser(userId, updates) {
        const user = await userRepository.update(userId, updates);

        if (!user) {
            throw new AppError('User not found', 404, 'USER_NOT_FOUND');
        }

        return {
            id: user.id,
            email: user.email,
            username: user.username,
            full_name: user.full_name,
            phone: user.phone,
            updated_at: user.updated_at
        };
    }
}

module.exports = new UserService();
