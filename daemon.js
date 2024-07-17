const path = require('path');
const fs = require('fs');
const os = require('os');
const spawn = require('child_process').spawn;
const cron = require('node-cron');
const dayjs = require('dayjs');
const express = require('express');
const phin = require('phin');
const DB = require('./db');
const fsp = fs.promises;

const TIMEOUT = 180000;
const ORPHAN = {
    "name": "orphan",
    "ircName": "orphaned"
};
const EXTRASPACE = new RegExp('\\s+', 'g');
const CHECKUPDATESCACHE = path.join(os.homedir(), '.cache', 'artix-checkupdates');
const NICETYPES = {
    move: 'move',
    udate: 'update'
}

function asyncSleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

class Daemon {

    constructor(config) {
        const app = express();
        const port = process.env.PRIVATEPORT || config.privateport || 8081;
        this._config = config;
        this._savePath = process.env.SAVEPATH || config.savePath || path.join(__dirname, 'config', 'data.json');
        console.log('Written by Cory Sanin for Artix Linux');
        this._locked = false;
        const db = this._db = new DB(process.env.DBPATH || config.db || path.join(__dirname, 'config', 'packages.db'));
        this._saveData = {
            'last-sync': null,
            move: [],
            update: []
        };

        app.set('trust proxy', 1);

        app.get('/healthcheck', (req, res) => {
            res.send('Healthy');
        });

        this.readSaveData();

        // resetting flags in case of improper shutdown
        db.restoreFlags();

        this._cronjob = cron.schedule(process.env.CRON || config.cron || '*/30 * * * *', () => {
            this.main(this._config);
        });

        this._webserver = app.listen(port);
    }

    main = async (config) => {
        const db = this._db;
        if (this._locked) {
            return
        }
        this._locked = true;
        console.log('Starting scheduled task');
        let now = dayjs();
        if (!('last-sync' in this._saveData) || !this._saveData['last-sync'] || dayjs(this._saveData['last-sync']).isBefore(now.subtract(process.env.SYNCFREQ || config.syncfreq || 2, 'days'))) {
            await this.updateMaintainers(config);
            this._saveData['last-sync'] = now.toJSON();
            await this.writeSaveData();
        }
        await this.checkupdates(config);
        await this.writeSaveData();
        this._locked = false;
        console.log('Task complete.');
    }

    cleanUpLockfiles = async () => {
        try {
            await fsp.rm(CHECKUPDATESCACHE, { recursive: true, force: true });
        }
        catch (ex) {
            console.error('Failed to remove the artix-checkupdates cache directory:', ex);
        }
    }

    updateMaintainers = async (config) => {
        const db = this._db;
        console.log('Syncing packages...');
        const lastseen = (new Date()).getTime();
        const maintainers = [...(config.maintainers || []), ORPHAN];
        for (let i = 0; i < maintainers.length; i++) {
            let maintainer = maintainers[i];
            if (typeof maintainer === 'object') {
                maintainer = maintainer.name;
            }
            console.log(`Syncing ${maintainer}...`);
            try {
                const packages = await this.getMaintainersPackages(maintainer);
                for (let j = 0; j < packages.length; j++) {
                    db.updatePackage(packages[j], maintainer, lastseen);
                    await asyncSleep(50); //maybe not needed anymore?
                }
            }
            catch (err) {
                console.error(`Failed to get packages for ${maintainer}`);
                console.error(err);
            }
        }
        console.log(`removing unused packages...`);
        db.cleanOldPackages(lastseen);
        console.log(`Package sync complete`);
    }

    checkupdates = async (config) => {
        const db = this._db;

        try {
            await this.handleUpdates(config, this._saveData.move = await this.execCheckUpdates(['-m']), 'move');
            await this.handleUpdates(config, this._saveData.update = await this.execCheckUpdates(['-u']), 'udate');
        }
        catch (ex) {
            console.error('Failed to check for updates:', ex);
        }
    }

    execCheckUpdates = (flags) => {
        return new Promise((resolve, reject) => {
            let process = spawn('artix-checkupdates', flags);
            let timeout = setTimeout(async () => {
                process.kill() && await this.cleanUpLockfiles();
                reject('Timed out');
            }, TIMEOUT);
            let outputstr = '';
            let errorOutput = '';
            process.stdout.on('data', data => {
                outputstr += data.toString();
            });
            process.stderr.on('data', err => {
                const errstr = err.toString();
                errorOutput += `${errstr}, `;
                console.error(errstr);
            });
            process.on('exit', async (code) => {
                if (code === 0 && errorOutput.length === 0) {
                    clearTimeout(timeout);
                    resolve(this.parseCheckUpdatesOutput(outputstr));
                }
                else {
                    errorOutput.includes('unable to lock database') && this.cleanUpLockfiles();
                    reject((code && `exited with ${code}`) || errorOutput);
                }
            });
        });
    }

    getMaintainersPackages = (maintainer) => {
        return new Promise((resolve, reject) => {
            let process = spawn('artixpkg', ['admin', 'query', maintainer === ORPHAN.name ? '-t' : '-m', maintainer]);
            let timeout = setTimeout(() => {
                reject('Timed out');
                process.kill();
            }, TIMEOUT);
            let packagelist = [];
            process.stdout.on('data', data => {
                packagelist = packagelist.concat(data.toString().trim().split('\n'));
            });
            process.stderr.on('data', err => {
                console.error(err.toString());
            })
            process.on('exit', async (code) => {
                if (code === 0) {
                    clearTimeout(timeout);
                    resolve(packagelist);
                }
                else {
                    reject(code);
                }
            });
        });
    }

    parseCheckUpdatesOutput = (output) => {
        let packages = [];
        const lines = output.split('\n');
        lines.forEach(l => {
            // "package" is "reserved"
            const reservethis = l.trim().replace(EXTRASPACE, ' ');
            if (reservethis.length > 0 && reservethis.indexOf('Package basename') < 0) {
                packages.push(reservethis.split(' ', 2)[0]);
            }
        });
        return packages;
    }

    handleUpdates = async (config, packs, type) => {
        const db = this._db;
        packs.forEach(v => {
            let p = db.getPackage(v);
            p && db.updateFlag(v, type, p[type] > 0 ? 2 : 4);
        });
        const maintainers = [...config.maintainers, ORPHAN];
        for (let i = 0; i < maintainers.length; i++) {
            const m = maintainers[i];
            const mname = typeof m === 'object' ? m.name : m;
            const ircName = typeof m === 'object' ? (m.ircName || mname) : m;
            const packages = db.getNewByMaintainer(mname, type);
            if (typeof m === 'object' && m.channels) {
                this.notify({
                    api: config.apprise,
                    urls: m.channels
                }, packages, NICETYPES[type]);
            }
            this.ircNotify(packages, ircName, NICETYPES[type]);
        }

        db.decrementFlags(type);
        db.restoreFlags(type);
    }

    notify = async (apprise, packarr, type) => {
        if (!(packarr && packarr.length && apprise && apprise.api && apprise.urls)) {
            return;
        }
        const packagesStr = packarr.map(p => p.package).join('\n');
        for (let i = 0; i < 25; i++) {
            try {
                return await phin({
                    url: `${apprise.api}/notify/`,
                    method: 'POST',
                    data: {
                        title: `${packarr[0].maintainer}: packages ready to ${type}`,
                        body: packagesStr,
                        urls: apprise.urls.join(',')
                    }
                });
            }
            catch (ex) {
                console.error('Failed to send notification, attempt #%d', i + 1);
                console.error(ex);
            }
        }
        return null;
    }

    ircNotify = async (packarr, maintainer, type) => {
        const config = this._config;
        if (!(packarr && packarr.length && config['irc-framework'])) {
            return;
        }
        const hostname = process.env.IRCHOSTNAME || config.irchostname || 'http://artix-notifier-irc:8081';
        const packagesStr = packarr.map(p => p.package).join('\n');
        for (let i = 0; i < 25; i++) {
            try {
                return await phin({
                    url: `${hostname}/api/1.0/notifications`,
                    method: 'POST',
                    data: {
                        message: `${maintainer}: packages ready to ${type}\n${packagesStr}\n-------- EOF --------`
                    }
                });
            }
            catch (ex) {
                console.error('Failed to send IRC notification, attempt #%d', i + 1);
                console.error(ex);
            }
        }
        return null;
    }

    readSaveData = async () => {
        try {
            this._saveData = JSON.parse(await fsp.readFile(this._savePath));
        }
        catch {
            console.error(`Failed to read existing save data at ${this._savePath}`);
        }
    }

    writeSaveData = async () => {
        const config = this._config;
        const hostname = process.env.WEBHOSTNAME || config.webhostname || 'http://artix-notifier-web:8081';
        try {
            await fsp.writeFile(this._savePath, JSON.stringify(this._saveData));
            phin({
                url: `${hostname}/api/1.0/data`,
                method: 'PUT'
            });
        }
        catch {
            console.error(`Failed to write save data to ${this._savePath}`);
        }
    }

    close = () => {
        if (this._webserver) {
            this._webserver.close();
        }
        if (this._cronjob) {
            this._cronjob.stop();
        }
    }
}

module.exports = Daemon;