const fs = require('fs');
const fsp = fs.promises;
const readline = require('readline');
const path = require('path');
const phin = require('phin');

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

function parseComparepkg(file, condition) {
    return new Promise((res, reject) => {
        let outarr = [];
        let linestart = -1
        const rl = readline.createInterface({
            input: fs.createReadStream(file),
            output: process.stdout,
            terminal: false
        });
        rl.on('line', line => {
            if (linestart === -1) {
                linestart = line.indexOf('Arch Repo');
            }
            else {
                line = line.substring(linestart).trim().replace(EXTRASPACE, ' ').split(' ', 3);
                if (line[0] !== 'Arch') {
                    if (condition(line)) {
                        outarr.push(line[2]);
                    }
                }
            }
        });
        rl.on('close', async () => {
            res(outarr);
        });
    });
}

function parseCheckupdates(file, condition) {
    return new Promise((res, reject) => {
        let modeIndex = 0;
        let modes = ['upgradable', 'movable'];
        let out = {
            upgradable: [],
            movable: []
        };
        let linestart = 0;
        const rl = readline.createInterface({
            input: fs.createReadStream(file),
            output: process.stdout,
            terminal: false
        });
        rl.on('line', line => {
            if (linestart === -1) {
                linestart = line.indexOf('Package basename');
            }
            else {
                line = line.substring(linestart).trim().replace(EXTRASPACE, ' ').split(' ', 2);
                if (line.length === 1 && line[0] === '') {
                    modeIndex++;
                }
                if (line[0] !== 'Package') {
                    if (condition(line)) {
                        out[modes[modeIndex]].push(line[0]);
                    }
                }
            }
        });
        rl.on('close', async () => {
            res(out);
        });
    });
}

fs.readFile(PKGCONFIG, async (err, data) => {
    if (err) {
        console.log(err);
    }
    else {
        data = JSON.parse(data);
        const CHECKUPDATES = data.CHECKUPDATES || path.join(__dirname, 'checkupdates.txt');
        const PREVIOUS = data.PREVIOUS || '/usr/volume/previous.json';
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

        let actionable = await parseCheckupdates(CHECKUPDATES, line => packages.indexOf(line[0]) >= 0);

        movable = actionable.movable;
        upgradable = actionable.upgradable;

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
});