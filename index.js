const fs = require('fs');
const fsp = fs.promises;
const spawn = require('child_process').spawn;
const phin = require('phin');

const TIMEOUT = 180000;
const PKGCONFIG = process.env.PKGCONFIG || '/usr/volume/packages.json';
const EXTRASPACE = new RegExp('\\s+', 'g');

let url;

function notify(packarr, type) {
    return phin({
        url,
        method: 'POST',
        data: {
            type,
            packages: packarr.join('<br/>')
        }
    });
}

function parseCheckUpdatesOutput(output, condition) {
    let packages = [];
    let lines = output.split('\n');
    lines.forEach(l => {
        let package = l.trim().replace(EXTRASPACE, ' ').split(' ', 2)[0];
        if (condition(package)) {
            packages.push(package);
        }
    });
    return packages;
}

function checkUpdates(flags, condition) {
    return new Promise((resolve, reject) => {
        let process = spawn('artix-checkupdates', flags);
        let timeout = setTimeout(() => {
            reject('Timed out');
            process.kill();
        }, TIMEOUT);
        let packagelist = [];
        process.stdout.on('data', data => {
            packagelist = packagelist.concat(parseCheckUpdatesOutput(data.toString(), condition));
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

async function getWatchedPackages(condition) {
    return {
        movable: await checkUpdates(['-m', '-t'], condition),
        upgradable: await checkUpdates(['-u'], condition)
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
        url = data.URL || 'http://localhost:8080/artix';
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
            let actionable = await getWatchedPackages(line => packages.indexOf(line) >= 0);

            movable = actionable.movable;
            upgradable = actionable.upgradable;

            console.log('Movable:');
            movable.forEach(pkg => console.log(pkg));
            console.log('\nUpgradable:');
            upgradable.forEach(pkg => console.log(pkg));

            try {
                await fsp.writeFile(PREVIOUS, JSON.stringify({
                    packages: upgradable,
                    movable
                }));
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
                await notify(newpack, 'move');
            }
            newpack = [];
            upgradable.forEach(package => {
                if (previousu.indexOf(package) === -1) {
                    newpack.push(package);
                }
            });
            if (newpack.length > 0) {
                await notify(newpack, 'upgrade');
            }
        }
        catch(ex) {
            console.log('Task failed:', ex);
        }
    }
});