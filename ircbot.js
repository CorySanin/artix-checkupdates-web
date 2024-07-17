const IRC = require('irc-framework');
const express = require('express');

class IRCBot {

    constructor(config) {
        const options = config['irc-framework'];
        const aux = this._aux = config.ircClient || {};
        const app = express();
        const port = process.env.PRIVATEPORT || config.privateport || 8081;
        this._channel = aux.channel;
        this._messageQueue = [];
        this._enabled = !!options;

        app.set('trust proxy', 1);
        app.use(express.json());

        app.get('/healthcheck', (req, res) => {
            if (this._bot && this._bot.connected) {
                res.send('healthy');
            }
            else {
                res.status(500).send('offline');
            }
        });

        app.post('/api/1.0/notifications', (req, res) => {
            const body = req.body;
            if (body && body.message) {
                this.sendMessage(body.message);
                res.json({
                    success: true
                });
            }
            else {
                res.status(400).json({
                    success: false,
                    error: 'must include `message` property in request body'
                });
            }
        });

        if (options) {
            const bot = this._bot = new IRC.Client(options);

            bot.on('sasl failed', d => console.error(d));

            bot.on('notice', d => console.log(`irc:notice: ${d.message}`));

            bot.on('action', d => console.log(`irc:action: ${d.message}`));

            setInterval(() => this.processMessageQueue(), 2000);

            this._webserver = app.listen(port, () => console.log(`artix-packy-notifier-irc running on port ${port}`));
        }
        else {
            console.log('"ircClient" not provided in config. IRC notifications will not be delivered.');
        }
    }

    connect() {
        return new Promise((resolve, reject) => {
            if (this._enabled) {
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
            }
            else {
                resolve();
            }
        });
    }

    sendMessage(str) {
        (this._enabled ? str.split('\n') : []).forEach(line => {
            this._messageQueue.push(line);
        });
    }

    processMessageQueue() {
        const bot = this._bot
        let message = bot.connected && this._messageQueue.shift();
        message && bot.say(this._channel, message);
    }

    close() {
        if (this._webserver) {
            this._webserver.close();
        }
        if (this._enabled && this._bot.connected) {
            this._bot.quit('Shutting down');
        }
    }
}

module.exports = IRCBot;