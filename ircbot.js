const IRC = require('irc-framework');

class IRCBot {

    constructor(config) {
        const options = config['irc-framework'];
        const aux = this._aux = config.ircClient || {};
        this._channel = aux.channel;
        this._messageQueue = [];
        if (options) {
            const bot = this._bot = new IRC.Client(options);

            bot.on('sasl failed', d => console.error(d));

            bot.on('notice', d => console.log(`irc:notice: ${d.message}`));

            bot.on('action', d => console.log(`irc:action: ${d.message}`));

            setInterval(() => this.processMessageQueue(), 2000);
        }
    }

    connect() {
        return new Promise((resolve, reject) => {
            const bot = this._bot;
            bot.connect();
            const callback = () => {
                clearTimeout(timeout);
                console.log(`IRC bot ${bot.user.nick} connected.`);
                bot.join(this._aux.channel, this._aux.channel_key);
                bot.removeListener('registered', callback);
                resolve();
            };
            const timeout = setTimeout(() => {
                bot.removeListener('registered', callback);
                reject('timeout exceeded');
            }, 60000);
            bot.on('registered', callback);
        });
    }

    sendMessage(str) {
        str.split('\n').forEach(line => {
            this._messageQueue.push(line);
        });
    }

    processMessageQueue() {
        const bot = this._bot
        let message = bot.connected && this._messageQueue.shift();
        message && bot.say(this._channel, message);
    }

    close() {
        if (this._bot.connected) {
            this._bot.quit('Shutting down');
        }
    }
}

module.exports = IRCBot;