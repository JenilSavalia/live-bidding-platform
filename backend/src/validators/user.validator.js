/**
 * User Validation Schemas
 */

const Joi = require('joi');

/**
 * User registration schema
 */
const registerSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),

    username: Joi.string()
        .alphanum()
        .min(3)
        .max(30)
        .required()
        .messages({
            'string.alphanum': 'Username must contain only letters and numbers',
            'string.min': 'Username must be at least 3 characters',
            'string.max': 'Username must not exceed 30 characters',
            'any.required': 'Username is required'
        }),

    password: Joi.string()
        .min(6)
        .required()
        .messages({
            'string.min': 'Password must be at least 6 characters',
            'any.required': 'Password is required'
        }),

    full_name: Joi.string()
        .max(255)
        .optional(),

    phone: Joi.string()
        .pattern(/^[0-9+\-\s()]+$/)
        .max(20)
        .optional()
        .messages({
            'string.pattern.base': 'Please provide a valid phone number'
        })
});

/**
 * User login schema
 */
const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': 'Please provide a valid email address',
            'any.required': 'Email is required'
        }),

    password: Joi.string()
        .required()
        .messages({
            'any.required': 'Password is required'
        })
});

/**
 * Update user profile schema
 */
const updateUserSchema = Joi.object({
    full_name: Joi.string()
        .max(255)
        .optional(),

    phone: Joi.string()
        .pattern(/^[0-9+\-\s()]+$/)
        .max(20)
        .optional()
        .messages({
            'string.pattern.base': 'Please provide a valid phone number'
        })
}).min(1); // At least one field required

module.exports = {
    registerSchema,
    loginSchema,
    updateUserSchema
};
