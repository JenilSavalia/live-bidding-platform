/**
 * Bid Validation Schemas
 */

const Joi = require('joi');

/**
 * Place bid schema
 */
const placeBidSchema = Joi.object({
    auctionId: Joi.string()
        .uuid()
        .required()
        .messages({
            'string.guid': 'Invalid auction ID format',
            'any.required': 'Auction ID is required'
        }),

    amount: Joi.number()
        .positive()
        .precision(2)
        .required()
        .messages({
            'number.positive': 'Bid amount must be positive',
            'any.required': 'Bid amount is required'
        })
});

module.exports = {
    placeBidSchema
};
