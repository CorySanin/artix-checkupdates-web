const fs = require('fs');
const fsp = fs.promises;
const readline = require('readline');
const path = require('path');
const phin = require('phin');

const PKGCONFIG = process.env.PKGCONFIG || '/usr/volume/packages.json';

let url;

function notify(packarr) {
    return phin({
        url,
        method: 'POST',
        headers: {
            'token': process.env.TOKEN || 'fucksystemd'
        },
        data: {
            packages: packarr.join(', ')
        }
    });
}

fs.readFile(PKGCONFIG, async (err, data) => {


    if (err) {
        console.log(err);
    }
    else {
        data = JSON.parse(data);
        const COMPAREPKG = data.COMPAREPKG || path.join(__dirname, 'comparepkg.txt');
        const PREVIOUS = data.PREVIOUS || '/usr/volume/previous.json';
        const packages = data.packages;
        url = data.URL || 'http://localhost:8080/artix';
        let ss_s, ss_e, previous = [], movable = [];
        try {
            const p = JSON.parse(await fsp.readFile(PREVIOUS));
            if ('packages' in p) {
                previous = p.packages;
            }
        }
        catch (ex) {
            console.log(`Could not read ${PREVIOUS}: ${ex}`);
        }
        const rl = readline.createInterface({
            input: fs.createReadStream(COMPAREPKG),
            output: process.stdout,
            terminal: false
        });
        rl.on('line', line => {
            if (!ss_e) {
                ss_s = line.indexOf('Package');
                ss_e = line.indexOf('Arch version');
            }
            else {
                const l = line.substring(ss_s, ss_e).trim();
                if (packages.indexOf(l) >= 0) {
                    movable.push(l);
                }
            }
        });
        rl.on('close', async () => {
            let newpack = [];
            await fsp.writeFile(PREVIOUS, JSON.stringify({ packages: movable }));
            movable.forEach(package => {
                if (previous.indexOf(package) === -1) {
                    newpack.push(package);
                }
            });
            if (newpack.length > 0) {
                await notify(newpack);
            }
        });
    }
});