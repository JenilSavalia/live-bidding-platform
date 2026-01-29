/**
 * User Controller - HTTP Request Handlers
 * 
 * Handles HTTP requests for user and authentication endpoints
 */

const userService = require('../services/user.service');

class UserController {
    /**
     * POST /api/auth/register - Register new user
     * 
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next middleware
     */
    async register(req, res, next) {
        try {
            const result = await userService.register(req.body);

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/login - User login
     * 
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next middleware
     */
    async login(req, res, next) {
        try {
            const result = await userService.login(req.body.email, req.body.password);

            res.status(200).json({
                success: true,
                message: 'Login successful',
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/users/me - Get current user profile
     * 
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next middleware
     */
    async getCurrentUser(req, res, next) {
        try {
            const user = await userService.getUserById(req.user.id);

            res.status(200).json({
                success: true,
                data: user
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * PUT /api/users/me - Update current user profile
     * 
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next middleware
     */
    async updateCurrentUser(req, res, next) {
        try {
            const user = await userService.updateUser(req.user.id, req.body);

            res.status(200).json({
                success: true,
                message: 'Profile updated successfully',
                data: user
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new UserController();
