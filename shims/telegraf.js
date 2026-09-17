// Telegraf shim for Cloudflare Workers
// Provides a minimal Telegraf class that works without the full library
// The real Telegraf library has native dependencies that don't work in Workers

// Minimal Telegraf class matching the expected interface
class Telegraf {
    constructor(token) {
        if (!token) {
            throw new Error('Bot token is required');
        }
        this.token = token;
        this.scene = {};
        this.middleware = [];
    }

    // Start the bot (returns a promise)
    launch() {
        console.log('🤖 Telegram bot launching...');
        return Promise.resolve();
    }

    // Stop the bot
    stop() {
        console.log('🛑 Telegram bot stopped');
    }

    // Command handler
    command(name, handler) {
        this.commands = this.commands || {};
        this.commands[name] = handler;
        return this;
    }

    // Use middleware
    use(middleware) {
        this.middleware = this.middleware || [];
        this.middleware.push(middleware);
        return this;
    }

    // Catch handler
    catch(handler) {
        this.catchHandler = handler;
        return this;
    }
}

// Export as named export for destructuring compatibility
// telegram-bot.js does: const { Telegraf } = require('telegraf')
module.exports = { Telegraf };