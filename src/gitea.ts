import { promises as fsp } from 'fs';
import os from 'os';
import path from 'path';
import { Gitea } from "@go-gitea/sdk.js";
import unquote from 'unquote';

const GIT_TOKEN = 'GIT_TOKEN';

export async function initGitea() {
    return new Gitea({
        baseUrl: 'https://gitea.artixlinux.org',
        auth: await getToken()
    });
}

export type { Gitea };

async function getToken() {
    const artoolsCfgPath = path.join(os.homedir(), '.config', 'artools', 'artools-pkg.conf');
    const artoolsCfg = await fsp.readFile(artoolsCfgPath, { encoding: 'utf-8' });
    const tokens = artoolsCfg.split('\n').map(line => line.split('=')).filter(parts => parts.length === 2 && parts[0]?.trim() === GIT_TOKEN);
    if (tokens.length === 0) {
        throw new Error(`artools config ${artoolsCfgPath} did not contain required key "${GIT_TOKEN}"`);
    }
    const tokenLine = tokens[tokens.length - 1]!;
    const token = tokenLine[tokenLine.length - 1]!;
    return unquote(token).trim();
}
