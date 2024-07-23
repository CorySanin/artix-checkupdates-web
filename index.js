const path = require('path');
const fs = require('fs');
const json5 = require('json5');

fs.readFile(process.env.CONFIG || path.join(__dirname, 'config', 'config.json'), (err, data) => {
    if (err) {
        console.error(err);
    }
    else {
        let config = json5.parse(data);
        let arg = process.env.COMPONENT || (process.execArgv && process.execArgv[0]);
        
        if (arg === 'daemon') {
            const Daemon = require('./daemon');
            const daemon = new Daemon(config);
            process.on('SIGTERM', daemon.close);
        }
        else if (arg === 'ircbot') {
            const IRCBot = require('./ircbot');
            const bot = new IRCBot(config);
            bot.connect();
            process.on('SIGTERM', bot.close);
        }
        else if (arg === 'web') {
            const Web = require('./web');
            const web = new Web(config);
            process.on('SIGTERM', web.close);
        }
        else {
            console.error('Please pass the component you wish to run.');
        }
    }
});