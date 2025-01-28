import * as path from 'path';
import * as fsp from 'node:fs/promises';
import JSON5 from 'json5';
import { IRCBot } from './ircBot.mjs';
import { Daemon } from './daemon.mjs';
import { Web } from './web.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const data = await fsp.readFile(process.env['CONFIG'] || path.join(PROJECT_ROOT, 'config', 'config.json'));

let config = JSON5.parse(data.toString());
let arg = process.env['COMPONENT'] || (process.execArgv && process.execArgv[0]);

if (arg === 'daemon') {
    const daemon = new Daemon(config);
    process.on('SIGTERM', daemon.close);
}
else if (arg === 'ircbot') {
    const bot = new IRCBot(config);
    bot.connect();
    process.on('SIGTERM', bot.close);
}
else if (arg === 'web') {
    const web = new Web(config);
    process.on('SIGTERM', web.close);
}
else {
    console.error('Please pass the component you wish to run.');
}
