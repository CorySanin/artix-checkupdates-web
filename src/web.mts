import fs from 'fs';
import * as fsp from 'node:fs/promises';
import { DB } from './db.mjs';
import express from 'express';
import * as useragent from 'express-useragent';
import prom from 'prom-client';
import sharp from 'sharp';
import * as path from 'path';
import type http from "http";
import type { Request, Response } from "express";
import type { Config } from './config.js';
import type { PackageDBEntry } from './db.mjs';
import type { SaveData } from './daemon.mjs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const VIEWOPTIONS = {
    outputFunctionName: 'echo'
};

type Action = "Move" | "Update";

type WebPackageObject = {
    package: string;
    action: Action;
    url: string;
}

type ParseablePackage = string | PackageDBEntry;

function inliner(file: string) {
    return fs.readFileSync(path.join(PROJECT_ROOT, file));
}

function parsePackage(p: ParseablePackage): string {
    return typeof p === 'string' ? p : p.package;
}

function packageUrl(p: ParseablePackage) {
    return `https://gitea.artixlinux.org/packages/${parsePackage(p)}`;
}

function prepPackages(arr: ParseablePackage[], action: Action): WebPackageObject[] {
    return arr.map(m => {
        return {
            package: parsePackage(m),
            action,
            url: packageUrl(m)
        }
    });
}

async function createOutlinedText(string: string, meta: sharp.Metadata, gravity: sharp.Gravity = 'west') {
    const txt = sharp({
        create: {
            width: meta.width || 0,
            height: meta.height || 0,
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
                    width: meta.width || 0,
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
    private _webserver: http.Server;
    private _privateserver: http.Server;

    constructor(options: Config) {
        const db = new DB(process.env['DBPATH'] || options.db || path.join(PROJECT_ROOT, 'config', 'packages.db'));
        const app = express();
        const privateapp = express();
        const port = process.env['PORT'] || options.port || 8080;
        const privateport = process.env['PRIVATEPORT'] || options.privateport || 8081;
        const METRICPREFIX = process.env['METRICPREFIX'] || 'artixpackages_';
        const maintainers = (options.maintainers || []).map(m => typeof m === 'object' ? m.name : m).sort();
        const savePath = process.env['SAVEPATH'] || options.savePath || path.join(PROJECT_ROOT, 'config', 'data.json');
        let saveData: SaveData = {
            'last-sync': null,
            move: [],
            update: []
        };

        app.set('trust proxy', 1);
        app.set('view engine', 'ejs');
        app.set('view options', VIEWOPTIONS);

        app.use(useragent.express());

        function sendError(req: Request, res: Response, status: number, description: string) {
            console.log(`${status} (${description}): ${req.url} requested by ${req.ip} "${req.headers['user-agent']}"`);
            if (req.useragent?.browser === 'curl') {
                res.send('404: not found\n');
                return;
            }
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

        async function readSave() {
            saveData = JSON.parse((await fsp.readFile(savePath)).toString());
        }

        function renderForCurl(packages: WebPackageObject[]) {
            const colHeader = 'Package basename';
            const tabSize = packages.reduce((acc, cur) => Math.max(acc, cur.package?.length || 0), colHeader.length) + 4;
            return `${colHeader.padEnd(tabSize, ' ')}Action\n${packages.map(p => `${p.package?.padEnd(tabSize, ' ')}${p.action}`).join('\n')}\n`;
        }

        app.get('/healthcheck', async (_, res) => {
            res.send('Healthy');
        });

        app.get('/', async (req, res) => {
            let packages = prepPackages(saveData.move, 'Move');
            packages = packages.concat(prepPackages(saveData.update, 'Update'));
            if (req.useragent?.browser === 'curl') {
                res.send(renderForCurl(packages));
                return;
            }
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
                if (req.useragent?.browser === 'curl') {
                    res.send(`${maintainer}'s pending actions\n\n${renderForCurl(packages)}`);
                    return;
                }
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
                const meta: sharp.Metadata = await img.metadata();

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
            const startsWith = req.query['startswith'] as string;
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

        privateapp.put('/api/1.0/data', (_, res) => {
            try {
                readSave();
                res.json({
                    success: true
                });
            }
            catch (ex) {
                console.error(ex);
                res.status(500).json({
                    success: false,
                    error: 'failed to read save data'
                });
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
                }, saveData.move.length);
                this.set({
                    maintainer: 'any',
                    action: 'update'
                }, saveData.update.length);
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
                console.error(ex);
                res.status(500).send('something went wrong.');
            }
        });

        app.use('/assets/', express.static('assets', {
            maxAge: '30d'
        }));

        app.use((req, res) => sendError(req, res, 404, 'File not found'));

        privateapp.use('/', app);

        readSave();

        this._webserver = app.listen(port, () => console.log(`artix-checkupdates-web running on port ${port}`));
        this._privateserver = privateapp.listen(privateport);
    }

    close = () => {
        this._webserver.close();
        this._privateserver.close();
    }
}

export default Web;
export { Web };
