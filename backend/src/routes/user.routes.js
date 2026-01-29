/**
 * User and Authentication Routes
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticateHTTP } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { registerSchema, loginSchema, updateUserSchema } = require('../validators/user.validator');

/**
 * POST /api/auth/register
 * Register a new user
 * 
 * Body:
 * {
 *   "email": "user@example.com",
 *   "username": "username",
 *   "password": "password123",
 *   "full_name": "Full Name",
 *   "phone": "+1234567890"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "User registered successfully",
 *   "data": {
 *     "user": { ... },
 *     "token": "jwt-token"
 *   }
 * }
 */
router.post('/auth/register', validate(registerSchema), userController.register);

/**
 * POST /api/auth/login
 * Authenticate user and get JWT token
 * 
 * Body:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Login successful",
 *   "data": {
 *     "user": { ... },
 *     "token": "jwt-token"
 *   }
 * }
 */
router.post('/auth/login', validate(loginSchema), userController.login);

/**
 * GET /api/users/me
 * Get current user profile (authenticated)
 * 
 * Headers:
 * Authorization: Bearer <jwt-token>
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "uuid",
 *     "email": "user@example.com",
 *     "username": "username",
 *     ...
 *   }
 * }
 */
router.get('/users/me', authenticateHTTP, userController.getCurrentUser);

/**
 * PUT /api/users/me
 * Update current user profile (authenticated)
 * 
 * Headers:
 * Authorization: Bearer <jwt-token>
 * 
 * Body:
 * {
 *   "full_name": "New Name",
 *   "phone": "+1234567890"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Profile updated successfully",
 *   "data": { ... }
 * }
 */
router.put('/users/me', authenticateHTTP, validate(updateUserSchema), userController.updateCurrentUser);

module.exports = router;
