/**
 * Auction Validation Schemas
 */

const Joi = require('joi');

/**
 * Create auction schema
 */
const createAuctionSchema = Joi.object({
    title: Joi.string()
        .min(3)
        .max(255)
        .required()
        .messages({
            'string.min': 'Title must be at least 3 characters',
            'string.max': 'Title must not exceed 255 characters',
            'any.required': 'Title is required'
        }),

    description: Joi.string()
        .max(5000)
        .optional(),

    category: Joi.string()
        .max(100)
        .optional(),

    starting_price: Joi.number()
        .positive()
        .precision(2)
        .required()
        .messages({
            'number.positive': 'Starting price must be positive',
            'any.required': 'Starting price is required'
        }),

    reserve_price: Joi.number()
        .positive()
        .precision(2)
        .min(Joi.ref('starting_price'))
        .optional()
        .messages({
            'number.positive': 'Reserve price must be positive',
            'number.min': 'Reserve price must be greater than or equal to starting price'
        }),

    bid_increment: Joi.number()
        .positive()
        .precision(2)
        .required()
        .messages({
            'number.positive': 'Bid increment must be positive',
            'any.required': 'Bid increment is required'
        }),

    start_time: Joi.date()
        .iso()
        .min('now')
        .required()
        .messages({
            'date.min': 'Start time must be in the future',
            'any.required': 'Start time is required'
        }),

    end_time: Joi.date()
        .iso()
        .greater(Joi.ref('start_time'))
        .required()
        .messages({
            'date.greater': 'End time must be after start time',
            'any.required': 'End time is required'
        })
});

module.exports = {
    createAuctionSchema
};
