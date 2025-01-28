import {  } from "node:os";

export type IRCFrameworkConfig = {
    host: string;
	port: number;
	nick: string;
}

export type AuxiliaryIRCConfig = {
    channel?: string;
    channel_key: string;
}

export type Maintainer = {
    name: string;
    channels?: string[];
    ircName?: string;
}

export type MaintainerArrayElement = (string | Maintainer);

export type Config = {
    webhostname: string;
    apprise: string;
    maintainers: MaintainerArrayElement[];
    cron?: string;
    syncfreq: number;
    db?: string;
    port?: number;
    privateport?: number;
    savePath?: string;
    irchostname?: string;
    'irc-framework'?: IRCFrameworkConfig;
    ircClient?: AuxiliaryIRCConfig;
}
