/**
 * Redis Lua Script Loader and Executor
 * 
 * This module loads Lua scripts from files, registers them with Redis using
 * SCRIPT LOAD, and provides helper functions to execute them.
 * 
 * CRITICAL: All bid operations MUST use these Lua scripts to ensure atomicity.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class LuaScriptManager {
    constructor(redisClient) {
        this.redisClient = redisClient;
        this.scripts = new Map();
        this.scriptSHAs = new Map();
    }

    /**
     * Load a Lua script from file and register it with Redis
     * @param {string} scriptName - Name of the script (without .lua extension)
     * @returns {Promise<string>} - SHA1 hash of the loaded script
     */
    async loadScript(scriptName) {
        const scriptPath = path.join(__dirname, 'lua-scripts', `${scriptName}.lua`);

        try {
            // Read script file
            const scriptContent = await fs.readFile(scriptPath, 'utf8');

            // Store script content
            this.scripts.set(scriptName, scriptContent);

            // Load script into Redis and get SHA
            const sha = await this.redisClient.scriptLoad(scriptContent);
            this.scriptSHAs.set(scriptName, sha);

            console.log(`Loaded Lua script: ${scriptName} (SHA: ${sha})`);
            return sha;
        } catch (error) {
            console.error(`Failed to load Lua script ${scriptName}:`, error);
            throw error;
        }
    }

    /**
     * Load all Lua scripts from the lua-scripts directory
     * @returns {Promise<void>}
     */
    async loadAllScripts() {
        const scriptsDir = path.join(__dirname, 'lua-scripts');
        const files = await fs.readdir(scriptsDir);

        const luaFiles = files.filter(file => file.endsWith('.lua'));

        for (const file of luaFiles) {
            const scriptName = file.replace('.lua', '');
            await this.loadScript(scriptName);
        }

        console.log(`Loaded ${luaFiles.length} Lua scripts`);
    }

    /**
     * Execute a Lua script by name
     * @param {string} scriptName - Name of the script to execute
     * @param {Array<string>} keys - Redis keys (KEYS array in Lua)
     * @param {Array<string>} args - Script arguments (ARGV array in Lua)
     * @returns {Promise<any>} - Script result (parsed JSON if applicable)
     */
    async executeScript(scriptName, keys = [], args = []) {
        const sha = this.scriptSHAs.get(scriptName);

        if (!sha) {
            throw new Error(`Script ${scriptName} not loaded. Call loadScript() first.`);
        }

        try {
            // Execute script using EVALSHA
            const result = await this.redisClient.evalSha(sha, {
                keys,
                arguments: args
            });

            // Try to parse JSON response
            try {
                return JSON.parse(result);
            } catch {
                // Return raw result if not JSON
                return result;
            }
        } catch (error) {
            // If script not found in Redis, reload and retry
            if (error.message.includes('NOSCRIPT')) {
                console.warn(`Script ${scriptName} not found in Redis, reloading...`);
                await this.loadScript(scriptName);
                return this.executeScript(scriptName, keys, args);
            }
            throw error;
        }
    }

    /**
     * Place a bid atomically using the place-bid Lua script
     * @param {string} auctionId - Auction UUID
     * @param {string} bidAmount - Bid amount as string (e.g., "150.00")
     * @param {string} bidderId - User UUID
     * @param {number} currentTime - Server Unix timestamp
     * @param {string} bidIncrement - Minimum bid increment
     * @returns {Promise<Object>} - Result object with status and data
     */
    async placeBid(auctionId, bidAmount, bidderId, currentTime, bidIncrement) {
        const keys = [`auction:${auctionId}`];
        const args = [
            bidAmount,
            bidderId,
            currentTime.toString(),
            bidIncrement
        ];

        return this.executeScript('place-bid', keys, args);
    }

    /**
     * Extend auction time if bid placed near the end
     * @param {string} auctionId - Auction UUID
     * @param {number} currentTime - Server Unix timestamp
     * @param {number} extensionThreshold - Seconds before end to trigger extension
     * @param {number} extensionDuration - Seconds to extend
     * @returns {Promise<Object>} - Result object with status and data
     */
    async extendAuction(auctionId, currentTime, extensionThreshold = 30, extensionDuration = 30) {
        const keys = [`auction:${auctionId}`];
        const args = [
            currentTime.toString(),
            extensionThreshold.toString(),
            extensionDuration.toString()
        ];

        return this.executeScript('extend-auction', keys, args);
    }

    /**
     * Finalize an auction atomically
     * @param {string} auctionId - Auction UUID
     * @param {number} currentTime - Server Unix timestamp
     * @returns {Promise<Object>} - Result object with winner and final state
     */
    async finalizeAuction(auctionId, currentTime) {
        const keys = [`auction:${auctionId}`];
        const args = [currentTime.toString()];

        return this.executeScript('finalize-auction', keys, args);
    }

    /**
     * Get the SHA hash of a loaded script
     * @param {string} scriptName - Name of the script
     * @returns {string|undefined} - SHA hash or undefined if not loaded
     */
    getScriptSHA(scriptName) {
        return this.scriptSHAs.get(scriptName);
    }

    /**
     * Check if a script is loaded
     * @param {string} scriptName - Name of the script
     * @returns {boolean}
     */
    isScriptLoaded(scriptName) {
        return this.scriptSHAs.has(scriptName);
    }
}

module.exports = LuaScriptManager;
