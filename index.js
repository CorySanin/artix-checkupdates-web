const fs = require('fs');
const fsp = fs.promises;
const spawn = require('child_process').spawn;
const phin = require('phin');

const TIMEOUT = 180000;
const PKGCONFIG = process.env.PKGCONFIG || '/usr/volume/packages.json';
const EXTRASPACE = new RegExp('\\s+', 'g');

async function notify(apprise, packarr, type) {
    for (let i = 0; i < 25; i++) {
        try {
            return await phin({
                url: `${apprise.api}/notify/`,
                method: 'POST',
                data: {
                    title: `Packages ready to ${type}`,
                    body: packarr.join('\n'),
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

function checkUpdates(flags) {
    return new Promise((resolve, reject) => {
        let process = spawn('artix-checkupdates', flags);
        let timeout = setTimeout(() => {
            reject('Timed out');
            process.kill();
        }, TIMEOUT);
        let packagelist = [];
        process.stdout.on('data', data => {
            packagelist = packagelist.concat(parseCheckUpdatesOutput(data.toString()));
        });
        process.stderr.on('data', err => {
            console.log(err.toString());
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

async function getPendingPackages() {
    return {
        movable: await checkUpdates(['-m']),
        upgradable: await checkUpdates(['-u'])
    };
}

fs.readFile(PKGCONFIG, async (err, data) => {
    if (err) {
        console.log(err);
    }
    else {
        data = JSON.parse(data);
        const PREVIOUS = data.PREVIOUS || process.env.PREVIOUS || '/usr/volume/previous.json';
        const packages = data.packages;
        const actionableFilter = p => packages.indexOf(p) >= 0;
        let previousm = [], previousu = [], movable = [], upgradable = [], newpack = [];
        try {
            const p = JSON.parse(await fsp.readFile(PREVIOUS));
            if ('packages' in p) {
                previousu = p.packages;
            }
            if ('movable' in p) {
                previousm = p.movable;
            }
        }
        catch (ex) {
            console.log(`Could not read ${PREVIOUS}: ${ex}`);
        }

        try {
            let allPending = await getPendingPackages();

            movable = allPending.movable.filter(actionableFilter);
            upgradable = allPending.upgradable.filter(actionableFilter);

            console.log('Movable:');
            movable.forEach(pkg => console.log(pkg));
            console.log('\nUpgradable:');
            upgradable.forEach(pkg => console.log(pkg));

            let output = {
                packages: upgradable,
                movable
            };
            if (data.writeAllPending) {
                output['allPackages'] = allPending.upgradable;
                output['allMovable'] = allPending.movable;
            }

            try {
                await fsp.writeFile(PREVIOUS, JSON.stringify(output));
            }
            catch (ex) {
                console.log(`Could not write ${PREVIOUS}: ${ex}`);
            }
            movable.forEach(package => {
                if (previousm.indexOf(package) === -1) {
                    newpack.push(package);
                }
            });
            if (newpack.length > 0) {
                await notify(data.apprise, newpack, 'move');
            }
            newpack = [];
            upgradable.forEach(package => {
                if (previousu.indexOf(package) === -1) {
                    newpack.push(package);
                }
            });
            if (newpack.length > 0) {
                await notify(data.apprise, newpack, 'upgrade');
            }
        }
        catch (ex) {
            console.log('Task failed:', ex);
        }
    }
});