const express = require('express');
const prom = require('prom-client');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname;
const VIEWOPTIONS = {
    outputFunctionName: 'echo'
};
const NAMECOMPLIANCE = [
    p => p.replace(/([a-zA-Z0-9]+)\+([a-zA-Z]+)/g, '$1-$2'),
    p => p.replace(/\+/g, "plus"),
    p => p.replace(/[^a-zA-Z0-9_\-\.]/g, "-"),
    p => p.replace(/[_\-]{2,}/g, "-")
]

function inliner(file) {
    return fs.readFileSync(path.join(PROJECT_ROOT, file));
}

function packageUrl(p) {
    let packagename = typeof p === 'string' ? p : p.package;
    return `https://gitea.artixlinux.org/packages/${NAMECOMPLIANCE.reduce((s, fn) => fn(s), packagename)}`;
}

function prepPackages(arr, action) {
    return arr.map(m => {
        return {
            package: m,
            action,
            url: packageUrl(m)
        }
    });
}

async function createOutlinedText(string, meta, gravity = 'west') {
    const txt = sharp({
        create: {
            width: meta.width,
            height: meta.height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        }
    }).composite([
        {
            input: {
                text: {
                    text: string,
                    font: 'Visitor TT2 BRK',
                    fontfile: path.join(PROJECT_ROOT, 'userbar', 'visitor', 'visitor2.ttf'),
                    width: meta.width,
                    dpi: 109,
                    rgba: true
                }
            },
            gravity
        }
    ]);

    const outline = await txt.clone().png().toBuffer();

    const mult = gravity === 'east' ? -1 : 1;

    const layers = [
        {
            input: (outline),
            top: 1 * mult,
            left: 0
        },
        {
            input: (outline),
            top: 0,
            left: 1 * mult
        },
        {
            input: (outline),
            top: 1 * mult,
            left: 2 * mult
        },
        {
            input: (outline),
            top: 2 * mult,
            left: 1 * mult
        },
        {
            input: (await txt.clone().linear(0, 255).png().toBuffer()),
            top: 1 * mult,
            left: 1 * mult
        }
    ];

    return txt.composite(layers);
}

class Web {
    constructor(db, options, savedata) {
        const app = express();
        const port = process.env.PORT || options.port || 8080;
        const METRICPREFIX = process.env.METRICPREFIX || 'artixpackages_';
        const maintainers = this._maintainers = (options.maintainers || []).map(m => typeof m === 'object' ? m.name : m).sort();

        app.set('trust proxy', 1);
        app.set('view engine', 'ejs');
        app.set('view options', VIEWOPTIONS);

        function sendError(req, res, status, description) {
            console.log(`${status} (${description}): ${req.url} requested by ${req.ip} "${req.headers['user-agent']}"`);
            res.render('error',
                {
                    inliner,
                    site: {
                        prefix: 'Artix Checkupdates',
                        suffix: 'Error'
                    },
                    status,
                    description
                },
                function (err, html) {
                    if (!err) {
                        res.status(status).send(html);
                    }
                    else {
                        console.error(err);
                        res.status(500).send(description);
                    }
                }
            );
        }

        app.get('/healthcheck', async (_, res) => {
            res.send('Healthy');
        });

        app.get('/', async (_, res) => {
            let packages = prepPackages(savedata.move, 'Move');
            packages = packages.concat(prepPackages(savedata.update, 'Update'));
            res.render('index',
                {
                    inliner,
                    site: {
                        prefix: 'Artix Checkupdates',
                        suffix: 'Web Edition'
                    },
                    packages,
                    maintainers: maintainers
                },
                function (err, html) {
                    if (!err) {
                        res.send(html);
                    }
                    else {
                        console.error(err);
                        sendError(req, res, 500, 'Something went wrong. Try again later.');
                    }
                }
            );
        });

        app.get('/maintainer/:maintainer', async (req, res) => {
            const maintainer = req.params.maintainer;
            const packagesOwned = db.getMaintainerPackageCount(maintainer);
            let packages = prepPackages(db.getPackagesByMaintainer(maintainer, 'move'), 'Move');
            packages = packages.concat(prepPackages(db.getPackagesByMaintainer(maintainer, 'udate'), 'Update'));
            if (packagesOwned > 0) {
                res.render('maintainer',
                    {
                        inliner,
                        site: {
                            prefix: 'Artix Checkupdates',
                            suffix: `${maintainer}'s pending actions`
                        },
                        maintainer,
                        packagesOwned,
                        packages
                    },
                    function (err, html) {
                        if (!err) {
                            res.send(html);
                        }
                        else {
                            console.error(err);
                            res.status(500).send('Something went wrong. Try again later.');
                        }
                    }
                );
            }
            else {
                sendError(req, res, 404, 'File not found');
            }
        });

        app.get('/userbar/:maintainer.png', async (req, res) => {
            const maintainer = req.params.maintainer;
            const packagesOwned = db.getMaintainerPackageCount(maintainer);
            if (packagesOwned > 0) {
                const img = sharp(path.join(PROJECT_ROOT, 'userbar', 'userbar.png'));
                const meta = await img.metadata();

                const layers = [
                    {
                        input: (await (await createOutlinedText('Artix Maintainer', meta)).png().toBuffer()),
                        top: 1,
                        left: 55
                    },
                    {
                        input: (await (await createOutlinedText(`${packagesOwned} packages`, meta, 'east')).png().toBuffer()),
                        top: 3,
                        left: -12
                    }
                ];

                res.set('Content-Type', 'image/png')
                    .set('Cache-Control', 'public, max-age=172800')
                    .send(await img.composite(layers).png({
                        quality: 90,
                        compressionLevel: 3
                    }).toBuffer());
            }
            else {
                sendError(req, res, 404, 'File not found');
            }
        });

        app.get('/robots.txt', (_, res) => {
            res.set('content-type', 'text/plain').send('User-agent: *\nDisallow: /metrics\n');
        });

        app.get('/api/1.0/maintainers', (req, res) => {
            const acceptHeader = req.headers.accept;
            res.set('Cache-Control', 'public, max-age=360');
            if (acceptHeader && acceptHeader.includes('application/json')) {
                res.json({
                    maintainers
                });
            }
            else {
                res.send(maintainers.join(' '));
            }
        });

        app.get('/api/1.0/packages', (req, res) => {
            const acceptHeader = req.headers.accept;
            const startsWith = req.query.startswith;
            const packages = db.getPackages(startsWith);
            res.set('Cache-Control', 'public, max-age=360');
            if (acceptHeader && acceptHeader.includes('application/json')) {
                res.json({
                    packages
                });
            }
            else {
                res.send(packages.join(' '));
            }
        });

        const register = prom.register;

        new prom.Gauge({
            name: `${METRICPREFIX}pending_packages`,
            help: 'Number of packages that have pending moves and updates.',
            labelNames: ['maintainer', 'action'],
            collect() {
                maintainers.forEach(m => {
                    this.set({
                        maintainer: `${m}`,
                        action: 'move'
                    }, db.getPackageCountByMaintainer(m, 'move'));
                    this.set({
                        maintainer: `${m}`,
                        action: 'update'
                    }, db.getPackageCountByMaintainer(m, 'udate'));
                });
                this.set({
                    maintainer: 'any',
                    action: 'move'
                }, savedata.move.length);
                this.set({
                    maintainer: 'any',
                    action: 'update'
                }, savedata.update.length);
            }
        });

        new prom.Gauge({
            name: `${METRICPREFIX}watched_packages`,
            help: 'Number of packages being monitored for updates.',
            labelNames: ['maintainer'],
            collect() {
                maintainers.forEach(m => {
                    this.set({
                        maintainer: `${m}`
                    }, db.getMaintainerPackageCount(m));
                });
            }
        });

        app.get('/metrics', async (_, res) => {
            try {
                res.set('Content-Type', register.contentType);
                res.end(await register.metrics());
            }
            catch (ex) {
                console.error(err);
                res.status(500).send('something went wrong.');
            }
        });

        app.use('/assets/', express.static('assets', {
            maxAge: '30d'
        }));

        app.use((req, res) => sendError(req, res, 404, 'File not found'));

        this._webserver = app.listen(port, () => console.log(`artix-packy-notifier-web running on port ${port}`));
    }

    close = () => {
        this._webserver.close();
    }
}

module.exports = Web;