import { Checkupdates } from 'artix-checkupdates';
import { DB } from './db.mjs';
import { spawn } from 'spawn-but-with-promises';
import ky from 'ky';
import delay from 'delay';
import * as path from 'path';
import * as fsp from 'node:fs/promises';
import * as cron from 'node-cron';
import dayjs from 'dayjs';
import express from 'express';
import type http from "http";
import type { Express } from "express";
import type { Config, MaintainerArrayElement } from './config.js';
import type { Category, PackageDBEntry } from './db.mjs';
import type Stream from 'node:stream';

const TIMEOUT = 180000;
export const ORPHAN = {
    "name": "orphan",
    "ircName": "orphaned"
};
const NICETYPES = {
    move: 'move',
    udate: 'update'
};

export type SaveData = {
    'last-sync': string | null;
    move: string[];
    update: string[];
}

export type AppriseConf = {
    api: string;
    urls: string[];
}

function notStupidParseInt(v: string | undefined): number {
    return v === undefined ? NaN : parseInt(v);
}

export class Daemon {
    private _config: Config;
    private _savePath: string;
    private _locked: boolean;
    private _saveData: SaveData;
    private _db: DB;
    private _cronjob: cron.ScheduledTask;
    private _webserver: http.Server;

    constructor(config: Config) {
        const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
        const app: Express = express();
        const port = process.env['PRIVATEPORT'] || config.privateport || 8081;
        this._config = config;
        this._savePath = process.env['SAVEPATH'] || config.savePath || path.join(PROJECT_ROOT, 'config', 'data.json');
        console.log('Written by Cory Sanin for Artix Linux');
        this._locked = false;
        const db = this._db = new DB(process.env['DBPATH'] || config.db || path.join(PROJECT_ROOT, 'config', 'packages.db'));
        this._saveData = {
            'last-sync': null,
            move: [],
            update: []
        };

        app.set('trust proxy', 1);

        app.get('/healthcheck', (_, res) => {
            res.send('Healthy');
        });

        this.readSaveData();

        // resetting flags in case of improper shutdown
        db.restoreFlags();

        this._cronjob = cron.schedule(process.env['CRON'] || config.cron || '*/30 * * * *', () => {
            this.main(this._config);
        });

        this._webserver = app.listen(port);
    }

    main = async (config: Config) => {
        if (this._locked) {
            return
        }
        this._locked = true;
        console.log('Starting scheduled task');
        const now = dayjs();
        if (!('last-sync' in this._saveData) || !this._saveData['last-sync'] || dayjs(this._saveData['last-sync']).isBefore(now.subtract(notStupidParseInt(process.env['SYNCFREQ']) || config.syncfreq || 2, 'days'))) {
            await this.updateMaintainers(config);
            this._saveData['last-sync'] = now.toJSON();
            await this.writeSaveData();
        }
        await this.checkupdates(config);
        await this.writeSaveData();
        this._locked = false;
        console.log('Task complete.');
    }

    updateMaintainers = async (config: Config) => {
        const db = this._db;
        console.log('Syncing packages...');
        const lastseen = (new Date()).getTime();
        const maintainers = config.maintainers || []; //[...(config.maintainers || []), ORPHAN];

        console.log('Getting all packages...');
        try {
            const packages = await this.getAllPackages();
            packages.forEach(p => {
                db.updatePackage(p, ORPHAN.name, lastseen);
            });
        }
        catch (err) {
            console.error(`Failed to get all packages`);
            console.error(err);
        }

        for (let i = 0; i < maintainers.length; i++) {
            const mae = maintainers[i] as MaintainerArrayElement;
            const maintainer = typeof mae === 'object' ? mae.name : mae;
            console.log(`Syncing ${maintainer}...`);
            try {
                const packages = await this.getMaintainersPackages(maintainer);
                packages.forEach(p => {
                    db.updatePackage(p, maintainer, lastseen);
                });
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

    checkupdates = async (config: Config) => {
        const check = new Checkupdates();
        try {
            await this.handleUpdates(config, this._saveData.move = (await check.fetchMovable()).map(p => p.basename), 'move');
            await this.handleUpdates(config, this._saveData.update = (await check.fetchUpgradable()).map(p => p.basename), 'udate');
        }
        catch (ex) {
            console.error('Failed to check for updates:', ex);
        }
    }

    getMaintainersPackages = async (maintainer: string): Promise<string[]> => {
        const process = spawn('artixpkg', ['admin', 'query', '-m', maintainer], { timeout: TIMEOUT, rejectOnNonZero: true });
        const packagelist: string[] = [];
        process.stdout.on('data', (data: Stream) => {
            packagelist.push(...data.toString().trim().split('\n'));
        });
        process.stderr.on('data', (err: Stream) => {
            console.error(err.toString());
        });
        await process;
        return packagelist;
    }

    getAllPackages = async () => {
        const repos = ['lib32', 'galaxy', 'world', 'system'];
        const suffixes = ['-goblins', '-gremlins', ''];
        const fqRepos: string[] = [];
        const packageSet: Set<string> = new Set();
        repos.forEach(r => {
            suffixes.forEach(s => {
                fqRepos.push(`${r}${s}`);
            });
        });
        while (true) {
            const repo = fqRepos.pop();
            if (repo === undefined) {
                break;
            }
            const process = spawn('artixpkg', ['admin', 'query', '-t', repo], { timeout: TIMEOUT, rejectOnNonZero: true });
            process.stdout.on('data', (data: Stream) => {
                data.toString().trim().split('\n').forEach(p => packageSet.add(p));
            });
            process.stderr.on('data', (err: Stream) => {
                console.error(err.toString());
            });
            await process;
            if (fqRepos.length) {
                await delay(5000);
            }
        }
        return [...packageSet];
    }

    handleUpdates = async (config: Config, packs: string[], type: Category) => {
        const db = this._db;
        packs.forEach(v => {
            const p = db.getPackage(v);
            p && db.updateFlag(v, type, p[type] > 0 ? 2 : 4);
        });
        const maintainers: MaintainerArrayElement[] = [...config.maintainers, ORPHAN];
        for (let i = 0; i < maintainers.length; i++) {
            const m = maintainers[i] as MaintainerArrayElement;
            const mname: string = typeof m === 'object' ? m.name : m;
            const ircName = typeof m === 'object' ? (m.ircName || mname) : m;
            const packages = db.getNewByMaintainer(mname, type);
            if (typeof m === 'object' && m.channels) {
                this.notify({
                    api: config.apprise,
                    urls: m.channels
                }, packages, NICETYPES[type]);
            }
            this.ircNotify(packages, ircName, NICETYPES[type]);
        }

        db.decrementFlags(type);
        db.restoreFlags(type);
    }

    notify = async (apprise: AppriseConf, packarr: PackageDBEntry[], type: string) => {
        if (!(packarr && packarr.length && apprise && apprise.api && apprise.urls)) {
            return;
        }
        const packagesStr = packarr.map(p => p.package).join('\n');
        for (let i = 0; i < 25; i++) {
            try {
                return await ky.post(`${apprise.api}/notify/`, {
                    json: {
                        title: `${packarr[0]?.maintainer}: packages ready to ${type}`,
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

    ircNotify = async (packarr: PackageDBEntry[], maintainer: string, type: string) => {
        const config = this._config;
        if (!(packarr && packarr.length && config['irc-framework'])) {
            return;
        }
        const hostname = process.env['IRCHOSTNAME'] || config.irchostname || 'http://artix-notifier-irc:8081';
        const packagesStr = packarr.map(p => p.package).join('\n');
        for (let i = 0; i < 25; i++) {
            try {
                return await ky.post(`${hostname}/api/1.0/notifications`, {
                    json: {
                        message: `${maintainer}: packages ready to ${type}\n${packagesStr}\n-------- EOF --------`
                    }
                });
            }
            catch (ex) {
                console.error('Failed to send IRC notification, attempt #%d', i + 1);
                console.error(ex);
            }
        }
        return null;
    }

    readSaveData = async () => {
        try {
            this._saveData = JSON.parse((await fsp.readFile(this._savePath)).toString());
        }
        catch {
            console.error(`Failed to read existing save data at ${this._savePath}`);
        }
    }

    writeSaveData = async () => {
        const config = this._config;
        const hostname = process.env['WEBHOSTNAME'] || config.webhostname || 'http://artix-notifier-web:8081';
        try {
            await fsp.writeFile(this._savePath, JSON.stringify(this._saveData));
            ky.put(`${hostname}/api/1.0/data`);
        }
        catch {
            console.error(`Failed to write save data to ${this._savePath}`);
        }
    }

    close = () => {
        if (this._webserver) {
            this._webserver.close();
        }
        if (this._cronjob) {
            this._cronjob.stop();
        }
    }
}

export default Daemon;
