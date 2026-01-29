/**
 * Validation Middleware
 * 
 * Joi schema validation middleware factory
 */

const { AppError } = require('./error');

/**
 * Validate request data against Joi schema
 * @param {Object} schema - Joi schema object
 * @returns {Function} - Express middleware
 */
const validate = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false, // Return all errors
            stripUnknown: true // Remove unknown fields
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            return next(new AppError(
                'Validation failed',
                400,
                'VALIDATION_ERROR',
                { errors }
            ));
        }

        // Replace req.body with validated value
        req.body = value;
        next();
    };
};

/**
 * Validate query parameters
 * @param {Object} schema - Joi schema object
 * @returns {Function} - Express middleware
 */
const validateQuery = (schema) => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req.query, {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));

            return next(new AppError(
                'Validation failed',
                400,
                'VALIDATION_ERROR',
                { errors }
            ));
        }

        req.query = value;
        next();
    };
};

module.exports = {
    validate,
    validateQuery
};
