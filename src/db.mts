import Database from 'better-sqlite3';

const TABLE = 'packages';

type Category = 'move' | 'udate';

interface CommonOperations {
    GET: Database.Statement;
    GETNEWBYMAINTAINER: Database.Statement;
    UPDATE: Database.Statement;
    INCREMENT: Database.Statement;
    DECREMENT: Database.Statement;
    FIXFLAG: Database.Statement;
    GETPACKAGESBYMAINTAINER: Database.Statement;
    GETPACKAGECOUNTBYMAINTAINER: Database.Statement;
}

interface DatabaseOperations {
    GETPACKAGE: Database.Statement;
    ADDPACKAGE: Database.Statement;
    GETPACKAGES: Database.Statement;
    GETPACKAGESSTARTWITH: Database.Statement;
    UPDATEMAINTAINER: Database.Statement;
    GETMAINTAINERPACKAGECOUNT: Database.Statement;
    REMOVEOLDPACKAGE: Database.Statement;
    move: CommonOperations;
    udate: CommonOperations;
}

interface PackageDBEntry {
    package: string;
    maintainer: string;
    move: number;
    udate: number;
    lastseen: Date;
}

interface CountResult {
    count: number;
}

class DB {
    private _db: Database.Database;
    private _queries: DatabaseOperations;

    constructor(file: string | Buffer) {
        this._db = new Database(file);
        const db = this._db;
        db.pragma('journal_mode = WAL');

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
                GETPACKAGESBYMAINTAINER: db.prepare(`SELECT * FROM ${TABLE} WHERE maintainer = @maintainer AND move > 0 ORDER BY package ASC;`),
                GETPACKAGECOUNTBYMAINTAINER: db.prepare(`SELECT COUNT(package) as count FROM ${TABLE} WHERE maintainer = @maintainer AND move > 0;`)
            },
            udate: {
                GET: db.prepare(`SELECT * FROM ${TABLE} WHERE udate = @bool;`),
                GETNEWBYMAINTAINER: db.prepare(`SELECT * FROM ${TABLE} WHERE maintainer = @maintainer AND udate = 4;`),
                UPDATE: db.prepare(`UPDATE ${TABLE} SET udate = @bool WHERE package = @package`),
                INCREMENT: db.prepare(`UPDATE ${TABLE} SET udate = udate + 1 WHERE package = @package`),
                DECREMENT: db.prepare(`UPDATE ${TABLE} SET udate = 0 WHERE udate = 1`),
                FIXFLAG: db.prepare(`UPDATE ${TABLE} SET udate = 1 WHERE udate > 1`),
                GETPACKAGESBYMAINTAINER: db.prepare(`SELECT * FROM ${TABLE} WHERE maintainer = @maintainer AND udate > 0 ORDER BY package ASC;`),
                GETPACKAGECOUNTBYMAINTAINER: db.prepare(`SELECT COUNT(package) as count FROM ${TABLE} WHERE maintainer = @maintainer AND udate > 0;`)
            }
        };
    }

    restoreFlags(type: Category | null = null) {
        if (type !== 'udate') {
            this._queries.move.FIXFLAG.run();
        }
        if (type !== 'move') {
            this._queries.udate.FIXFLAG.run();
        }
    }

    getPackage(pack: string): PackageDBEntry {
        return this._queries.GETPACKAGE.get({
            package: pack
        }) as PackageDBEntry;
    }

    getPackages(startsWith: string | null = null): string[] {
        return ((!!startsWith) ? this._queries.GETPACKAGESSTARTWITH.all({ startsWith }) :
            this._queries.GETPACKAGES.all()).map(p => (p as PackageDBEntry).package);
    }

    updatePackage(pack: string, maintainer: string, lastseen: number): Database.RunResult {
        return this._queries[this.getPackage(pack) ? 'UPDATEMAINTAINER' : 'ADDPACKAGE'].run({
            package: pack,
            maintainer,
            lastseen
        });
    }

    incrementFlag(pack: string, type: Category): boolean {
        this._queries[type].INCREMENT.run({
            package: pack
        });
        return true;
    }

    decrementFlags(type: Category): boolean {
        this._queries[type].DECREMENT.run();
        return true;
    }

    updateFlag(pack: string, type: Category, bool: number): boolean {
        this._queries[type].UPDATE.run({
            package: pack,
            bool
        });
        return true;
    }

    getFlag(type: Category, bool: boolean = true): PackageDBEntry[] {
        return this._queries[type].GET.all({
            bool
        }) as PackageDBEntry[];
    }

    getNewByMaintainer(maintainer: string, type: Category): PackageDBEntry[] {
        return this._queries[type].GETNEWBYMAINTAINER.all({
            maintainer
        }) as PackageDBEntry[];
    }

    getPackagesByMaintainer(maintainer: string, type: Category): PackageDBEntry[] {
        return this._queries[type].GETPACKAGESBYMAINTAINER.all({
            maintainer
        }) as PackageDBEntry[];
    }

    getPackageCountByMaintainer(maintainer: string, type: Category): number {
        return (this._queries[type].GETPACKAGECOUNTBYMAINTAINER.get({
            maintainer
        }) as CountResult).count;
    }

    cleanOldPackages(lastseen: number): Database.RunResult {
        return this._queries.REMOVEOLDPACKAGE.run({
            lastseen
        });
    }

    getMaintainerPackageCount(maintainer: string): number {
        return (this._queries.GETMAINTAINERPACKAGECOUNT.get({
            maintainer
        }) as CountResult).count;
    }
}

export default DB;
export { DB };
export type { PackageDBEntry, Category };
