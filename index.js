const path = require('path');
const fs = require('fs');
const spawn = require('child_process').spawn;
const cron = require('node-cron');
const dayjs = require('dayjs');
const json5 = require('json5');
const phin = require('phin');
const DB = require('./db');
const Web = require('./web');
const fsp = fs.promises;

const TIMEOUT = 180000;
const EXTRASPACE = new RegExp('\\s+', 'g');
const NICETYPES = {
    move: 'move',
    udate: 'update'
}

let saveData = {
    'last-sync': null,
    move: [],
    update: []
}

let cronjob;

let savePath = process.env.SAVEPATH || path.join(__dirname, 'config', 'data.json');

fs.readFile(process.env.CONFIGPATH || path.join(__dirname, 'config', 'config.json'), async (err, data) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    else {
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

        cronjob = cron.schedule(process.env.CRON || config.cron || '*/30 * * * *', () => {
            main(config, db);
        });

        process.on('SIGTERM', (new Web(db, config, saveData)).close);
    }
});

async function main(config, db) {
    console.log('Starting scheduled task');
    cronjob.stop();
    let now = dayjs();
    if (!('last-sync' in saveData) || !saveData['last-sync'] || dayjs(saveData['last-sync']).isBefore(now.subtract(3, 'days'))) {
        await updateMaintainers(config, db);
        saveData['last-sync'] = now.toJSON();
        await writeSaveData();
    }
    await checkupdates(config, db);
    await writeSaveData();
    cronjob.start();
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
    await handleUpdates(config, db, saveData.move = await execCheckUpdates(['-m']), 'move');
    await handleUpdates(config, db, saveData.update = await execCheckUpdates(['-u']), 'udate');
}

async function handleUpdates(config, db, packs, type) {
    packs.forEach(v => {
        let p = db.getPackage(v);
        p && db.updateFlag(v, type, p[type] > 0 ? 2 : 4);
    });

    for (let i = 0; i < config.maintainers.length; i++) {
        let m = config.maintainers[i];
        if (typeof m === 'object') {
            notify({
                api: config.apprise,
                urls: m.channels
            }, db.getNewByMaintainer(m.name, type), NICETYPES[type])
        }
    }

    db.decrementFlags(type);
    db.restoreFlags(type);
}

async function updateMaintainers(config, db) {
    console.log('Syncing packages...');
    const lastseen = (new Date()).getTime();
    const maintainers = config.maintainers;
    for (let i = 0; maintainers && i < maintainers.length; i++) {
        let maintainer = maintainers[i];
        if (typeof maintainer === 'object') {
            maintainer = maintainer.name;
        }
        console.log(`Syncing ${maintainer}...`);
        try {
            (await getMaintainersPackages(maintainer)).forEach(package => db.updatePackage(package, maintainer, lastseen));
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
        let process = spawn('artixpkg', ['admin', 'query', '-m', maintainer]);
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
    if (!(packarr && packarr.length)) {
        return;
    }
    for (let i = 0; i < 25; i++) {
        try {
            return await phin({
                url: `${apprise.api}/notify/`,
                method: 'POST',
                data: {
                    title: `${packarr[0].maintainer}: packages ready to ${type}`,
                    body: packarr.map(p => p.package).join('\n'),
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

function execCheckUpdates(flags) {
    return new Promise((resolve, reject) => {
        let process = spawn('artix-checkupdates', flags);
        let timeout = setTimeout(() => {
            reject('Timed out');
            process.kill();
        }, TIMEOUT);
        let outputstr = '';
        process.stdout.on('data', data => {
            outputstr += data.toString();
        });
        process.stderr.on('data', err => {
            console.error(err.toString());
        })
        process.on('exit', async (code) => {
            if (code === 0) {
                clearTimeout(timeout);
                resolve(parseCheckUpdatesOutput(outputstr));
            }
            else {
                reject(code);
            }
        });
    });
}