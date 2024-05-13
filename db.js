const sqlite = require('better-sqlite3');
const TABLE = 'packages';

class DB {
    constructor(file) {
        this._db = new sqlite(file);
        const db = this._db;

        if (!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${TABLE}';`).get()) {
            db.prepare(`CREATE TABLE ${TABLE} (package VARCHAR(128) PRIMARY KEY, maintainer VARCHAR(128), move INTEGER, udate INTEGER, lastseen DATETIME);`).run();
        }

        this._queries = {
            GETPACKAGE: db.prepare(`SELECT * FROM ${TABLE} WHERE package = @package;`),
            ADDPACKAGE: db.prepare(`INSERT INTO ${TABLE} (package,maintainer,move,udate,lastseen) VALUES (@package, @maintainer, 0, 0, @lastseen);`),
            GETPACKAGES: db.prepare(`SELECT package FROM ${TABLE}`),
            GETPACKAGESSTARTWITH: db.prepare(`SELECT package FROM ${TABLE} WHERE package LIKE @startsWith || '%'`),
            UPDATEMAINTAINER: db.prepare(`UPDATE ${TABLE} SET maintainer = @maintainer, lastseen= @lastseen WHERE package = @package`),
            GETMAINTAINERPACKAGECOUNT: db.prepare(`SELECT COUNT(package) as count FROM ${TABLE} WHERE maintainer = @maintainer;`),
            REMOVEOLDPACKAGE: db.prepare(`DELETE FROM ${TABLE} WHERE lastseen < @lastseen;`),
            move: {
                GET: db.prepare(`SELECT * FROM ${TABLE} WHERE move = @bool;`),
                GETNEWBYMAINTAINER: db.prepare(`SELECT * FROM ${TABLE} WHERE maintainer = @maintainer AND move = 4;`),
                UPDATE: db.prepare(`UPDATE ${TABLE} SET move = @bool WHERE package = @package`),
                INCREMENT: db.prepare(`UPDATE ${TABLE} SET move = move + 1 WHERE package = @package`),
                DECREMENT: db.prepare(`UPDATE ${TABLE} SET move = 0 WHERE move = 1`),
                FIXFLAG: db.prepare(`UPDATE ${TABLE} SET move = 1 WHERE move > 1`),
                GETPACKAGESBYMAINTAINER: db.prepare(`SELECT * FROM ${TABLE} WHERE maintainer = @maintainer AND move > 0;`),
                GETPACKAGECOUNTBYMAINTAINER: db.prepare(`SELECT COUNT(package) as count FROM ${TABLE} WHERE maintainer = @maintainer AND move > 0;`)
            },
            udate: {
                GET: db.prepare(`SELECT * FROM ${TABLE} WHERE udate = @bool;`),
                GETNEWBYMAINTAINER: db.prepare(`SELECT * FROM ${TABLE} WHERE maintainer = @maintainer AND udate = 4;`),
                UPDATE: db.prepare(`UPDATE ${TABLE} SET udate = @bool WHERE package = @package`),
                INCREMENT: db.prepare(`UPDATE ${TABLE} SET udate = udate + 1 WHERE package = @package`),
                DECREMENT: db.prepare(`UPDATE ${TABLE} SET udate = 0 WHERE udate = 1`),
                FIXFLAG: db.prepare(`UPDATE ${TABLE} SET udate = 1 WHERE udate > 1`),
                GETPACKAGESBYMAINTAINER: db.prepare(`SELECT * FROM ${TABLE} WHERE maintainer = @maintainer AND udate > 0;`),
                GETPACKAGECOUNTBYMAINTAINER: db.prepare(`SELECT COUNT(package) as count FROM ${TABLE} WHERE maintainer = @maintainer AND udate > 0;`)
            }
        };
    }

    restoreFlags() {
        this._queries.move.FIXFLAG.run();
        this._queries.udate.FIXFLAG.run();
    }

    getPackage(pack) {
        return this._queries.GETPACKAGE.get({
            package: pack
        });
    }

    getPackages(startsWith = null) {
        return ((!!startsWith) ? this._queries.GETPACKAGESSTARTWITH.all({ startsWith }) :
            this._queries.GETPACKAGES.all()).map(p => p.package);
    }

    updatePackage(pack, maintainer, lastseen) {
        return this._queries[this.getPackage(pack) ? 'UPDATEMAINTAINER' : 'ADDPACKAGE'].run({
            package: pack,
            maintainer,
            lastseen
        });
    }

    incrementFlag(pack, type) {
        this._queries[type].INCREMENT.run({
            package: pack
        });
        return true;
    }

    decrementFlags(type) {
        this._queries[type].DECREMENT.run();
        return true;
    }

    updateFlag(pack, type, bool) {
        this._queries[type].UPDATE.run({
            package: pack,
            bool
        });
        return true;
    }

    getFlag(type, bool = true) {
        return this._queries[type].GET.all({
            bool
        });
    }

    getNewByMaintainer(maintainer, type) {
        return this._queries[type].GETNEWBYMAINTAINER.all({
            maintainer
        });
    }

    getPackagesByMaintainer(maintainer, type) {
        return this._queries[type].GETPACKAGESBYMAINTAINER.all({
            maintainer
        });
    }

    getPackageCountByMaintainer(maintainer, type) {
        return this._queries[type].GETPACKAGECOUNTBYMAINTAINER.get({
            maintainer
        }).count;
    }

    cleanOldPackages(lastseen) {
        return this._queries.REMOVEOLDPACKAGE.run({
            lastseen
        });
    }

    getMaintainerPackageCount(maintainer) {
        return this._queries.GETMAINTAINERPACKAGECOUNT.get({
            maintainer
        }).count;
    }
}

module.exports = DB;