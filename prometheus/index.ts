import express from 'express';
import prom from 'prom-client';
import fs from 'fs';
const fsp = fs.promises;
const http = express();

const NAME = 'Artix Package Exporter';
const PORT = process.env.PORT || 8080;
const METRICPREFIX = process.env.METRICPREFIX || 'artixpackages_';
const register = prom.register;
const NICE_NAMES: any = {
    packages: 'My upgradable',
    movable: 'My movable',
    allPackages: 'All upgradable',
    allMovable: 'All movable'
};

new prom.Gauge({
    name: `${METRICPREFIX}pending_packages`,
    help: 'Number of packages that have pending updates or moves.',
    labelNames: ['category'],
    async collect() {
        const prev = JSON.parse((await fsp.readFile(process.env.PREVIOUS || '/usr/volume/previous.json')).toString());
        for (const category in prev) {
            this.set({ category: ((category in NICE_NAMES) ? NICE_NAMES[category] : category) }, (prev[category] as string[]).length);
        }
    }
});

new prom.Gauge({
    name: `${METRICPREFIX}watched_packages`,
    help: 'Number of packages being monitored for updates.',
    async collect() {
        const config = JSON.parse((await fsp.readFile(process.env.PACKAGES || '/usr/volume/packages.json')).toString());
        this.set('packages' in config ? config['packages'].length : 0);
    }
});

http.get('/', async (_, res) => {
    res.send(NAME);
});

http.get('/metrics', async (_, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    }
    catch (ex) {
        res.status(500).send(ex);
    }
});

http.get('/healthcheck', async (_, res) => {
    res.send('Healthy');
});

process.on('SIGTERM', http.listen(PORT, () => {
    console.log(`${NAME} running on port ${PORT}.`);
}).close);