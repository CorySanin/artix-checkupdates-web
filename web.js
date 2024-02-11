const express = require('express');
const prom = require('prom-client');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = __dirname;
const VIEWOPTIONS = {
    outputFunctionName: 'echo'
};

function inliner(file) {
    return fs.readFileSync(path.join(PROJECT_ROOT, file));
}

class Web {
    constructor(db, options, savedata) {
        const app = express();
        const port = process.env.PORT || options.port || 8080;
        const METRICPREFIX = process.env.METRICPREFIX || 'artixpackages_';
        const maintainers = this._maintainers = options.maintainers.map(m => typeof m === 'object' ? m.name : m).sort();

        app.set('trust proxy', 1);
        app.set('view engine', 'ejs');
        app.set('view options', VIEWOPTIONS);

        function sendError(res, status, description) {
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
            res.render('index',
                {
                    inliner,
                    site: {
                        prefix: 'Artix Checkupdates',
                        suffix: 'Web Edition'
                    },
                    savedata,
                    maintainers: maintainers
                },
                function (err, html) {
                    if (!err) {
                        res.send(html);
                    }
                    else {
                        console.error(err);
                        sendError(res, 500, 'Something went wrong. Try again later.');
                    }
                }
            );
        });

        app.get('/maintainer/:maintainer', async (req, res) => {
            const maintainer = req.params.maintainer;
            const packagesOwned = db.getMaintainerPackageCount(maintainer);
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
                        moves: db.getPackagesByMaintainer(maintainer, 'move'),
                        updates: db.getPackagesByMaintainer(maintainer, 'udate'),
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
                sendError(res, 404, 'File not found');
            }
        });

        app.get('/robots.txt', (_, res) => {
            res.set('content-type', 'text/plain').send('User-agent: *\nDisallow: /metrics\n');
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
                res.status(500).send(ex);
            }
        });

        app.use('/assets/', express.static('assets', {
            maxAge: '30d'
        }));

        this._webserver = app.listen(port, () => console.log(`artix-packy-notifier-web running on port ${port}`));
    }

    close = () => {
        this._webserver.close();
    }
}

module.exports = Web;