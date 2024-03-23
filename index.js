const path = require('path');
const fs = require('fs');
const os = require('os');
const spawn = require('child_process').spawn;
const cron = require('node-cron');
const dayjs = require('dayjs');
const json5 = require('json5');
const phin = require('phin');
const DB = require('./db');
const IRCBot = require('./ircbot');
const Web = require('./web');
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

let saveData = {
    'last-sync': null,
    move: [],
    update: []
}

let ircBot;
let locked = false;

let savePath = process.env.SAVEPATH || path.join(__dirname, 'config', 'data.json');

fs.readFile(process.env.CONFIGPATH || path.join(__dirname, 'config', 'config.json'), async (err, data) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    else {
        console.log('Written by Cory Sanin for Artix Linux');
        const config = json5.parse(data);
        savePath = config.savePath || savePath;
        const db = new DB(process.env.DBPATH || config.db || path.join(__dirname, 'config', 'packages.db'));

        try {
            saveData = JSON.parse(await fsp.readFile(savePath));
        }
        catch {
            console.error(`Failed to read existing save data at ${savePath}`);
        }

        // resetting flags in case of improper shutdown
        db.restoreFlags();

        let cronjob = cron.schedule(process.env.CRON || config.cron || '*/30 * * * *', () => {
            main(config, db);
        });

        const web = new Web(db, config, saveData);
        ircBot = new IRCBot(config);
        ircBot.connect();

        process.on('SIGTERM', () => {
            cronjob.stop();
            web.close();
            ircBot.close();
        });
    }
});

async function main(config, db) {
    if (locked) {
        return
    }
    locked = true;
    console.log('Starting scheduled task');
    let now = dayjs();
    if (!('last-sync' in saveData) || !saveData['last-sync'] || dayjs(saveData['last-sync']).isBefore(now.subtract(process.env.SYNCFREQ || config.syncfreq || 2, 'days'))) {
        ircBot.close();
        await updateMaintainers(config, db);
        saveData['last-sync'] = now.toJSON();
        await writeSaveData();
        await ircBot.connect();
    }
    await checkupdates(config, db);
    await writeSaveData();
    locked = false;
    console.log('Task complete.');
}

async function writeSaveData() {
    try {
        await fsp.writeFile(savePath, JSON.stringify(saveData));
    }
    catch {
        console.error(`Failed to write save data to ${savePath}`);
    }
}

async function checkupdates(config, db) {
    try {
        await handleUpdates(config, db, saveData.move = await execCheckUpdates(['-m']), 'move');
        await handleUpdates(config, db, saveData.update = await execCheckUpdates(['-u']), 'udate');
    }
    catch (ex) {
        console.error('Failed to check for updates:', ex);
    }
}

async function handleUpdates(config, db, packs, type) {
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
            notify({
                api: config.apprise,
                urls: m.channels
            }, packages, NICETYPES[type])
        }
        ircNotify(packages, ircName, NICETYPES[type]);
    }

    db.decrementFlags(type);
    db.restoreFlags(type);
}

async function updateMaintainers(config, db) {
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
            const packages = await getMaintainersPackages(maintainer);
            for (let j = 0; j < packages.length; j++) {
                const package = packages[j];
                db.updatePackage(package, maintainer, lastseen);
                await asyncSleep(50);
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

function getMaintainersPackages(maintainer) {
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

async function notify(apprise, packarr, type) {
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

function ircNotify(packarr, maintainer, type) {
    if (!(packarr && packarr.length)) {
        return;
    }
    const packagesStr = packarr.map(p => p.package).join('\n');
    for (let i = 0; i < 25; i++) {
        try {
            return ircBot.sendMessage(`${maintainer}: packages ready to ${type}\n${packagesStr}\n-------- EOF --------`);
        }
        catch (ex) {
            console.error('Failed to send IRC notification, attempt #%d', i + 1);
            console.error(ex);
        }
    }
    return null;
}

function parseCheckUpdatesOutput(output) {
    let packages = [];
    let lines = output.split('\n');
    lines.forEach(l => {
        let package = l.trim().replace(EXTRASPACE, ' ');
        if (package.length > 0 && package.indexOf('Package basename') < 0) {
            packages.push(package.split(' ', 2)[0]);
        }
    });
    return packages;
}

async function cleanUpLockfiles() {
    try {
        await fsp.rm(CHECKUPDATESCACHE, { recursive: true, force: true });
    }
    catch (ex) {
        console.error('Failed to remove the artix-checkupdates cache directory:', ex);
    }
}

function execCheckUpdates(flags, errCallback) {
    return new Promise((resolve, reject) => {
        let process = spawn('artix-checkupdates', flags);
        let timeout = setTimeout(async () => {
            process.kill() && await cleanUpLockfiles();
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
        })
        process.on('exit', async (code) => {
            if (code === 0 && errorOutput.length === 0) {
                clearTimeout(timeout);
                resolve(parseCheckUpdatesOutput(outputstr));
            }
            else {
                errorOutput.includes('unable to lock database') && cleanUpLockfiles();
                reject((code && `exited with ${code}`) || errorOutput);
            }
        });
    });
}

function asyncSleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}