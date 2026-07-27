# artix-checkupdates-web

Notification system and web frontend for Artix packages with pending operations. Notifications can be sent via
[Apprise](https://github.com/caronc/apprise/wiki#notification-services) or IRC. Web interface shows all packages with pending operations
and publishes prometheus metrics.

## configuration

create `config/config.json`:

| Variable        | Description                                                                                                           |
|-----------------|-----------------------------------------------------------------------------------------------------------------------|
| apprise | The URL of the Apprise instance for sending notifications |
| maintainers | Array of maintainer names as strings or objects containing the `name` of the maintainer and a list of `channels` to send notifications to |
| cron | The cron schedule for when the application should check for pending operations via [artix-checkupdates](https://gitea.artixlinux.org/artix/artix-checkupdates) |
| syncfreq | How often (in days) should the application sync package ownership from Gitea |
| nvcheckfreq | How often (in days) should the application run nvchecker against non-Arch packages |
| port | What port to run the webserver on (defaults to 8080) |
| savePath | Location of auxiliary save data (defaults to `config/data.db`) |
| db | Location of the SQLite DB (defaults to `config/packages.db`) |
| irc-framework | The options to feed into [irc-framework](https://github.com/kiwiirc/irc-framework/blob/master/docs/clientapi.md) |
| ircClient | Auxilary config data for the IRC bot. For now, it takes `ircClient.channel` and optionally `ircClient.channel_key` |

Note that the IRC bot needs to be exempt from excess flooding. The following command permanently voices a bot on Libera.chat:
```
/msg ChanServ FLAGS #example artix-update-bot +V
```
If the channel is intended only for the bot to broadcast, consider setting the channel mode to "moderated":
```
/mode +m #example
```

## How to run

```
pnpm install
pnpm run build
node distribution/index.mjs
```

## Docker Setup

Image : `ghcr.io/corysanin/artix-checkupdates-web:latest`

mount a folder to `/usr/notifier/config`.

Include a `config.json` as described above.

Include `artools-pkg.conf`:
```
GIT_TOKEN='YOUR-GITEA-TOKEN-HERE'
```

Include `artix-checkupdates.conf`:
```
ARTIX_MIRROR=https://example.com/%s/os/x86_64
ARCH_MIRROR=https://example.com/%s/os/x86_64
ARTIX_REPOS=system-goblins,world-goblins,galaxy-goblins,lib32-goblins,system-gremlins,world-gremlins,galaxy-gremlins,lib32-gremlins,system,world,galaxy,lib32
ARCH_REPOS=core-staging,extra-staging,multilib-staging,core-testing,extra-testing,multilib-testing,core,extra,multilib
```

# Checking for updates

## Packages from Arch

The primary method for checking for updates is with [artix-checkupdates](https://gitea.artixlinux.org/artix/artix-checkupdates). This compares Artix's version to Arch's. This check is performed every 10 minutes.

## Artix-Only Packages

It is imperative that non-Arch packages have a `.nvchecker.toml` file committed. Without it, there is no way to track which packages need updates!

**Once a day**, checkupdates web clones all Artix-only packages (as obtained by `artix-checkupdates -a`). If the repo has an nvchecker configuration file, nvchecker will determine if there's a pending update. If the package happens to be an init script package, checkupdates web will check for the existence of an appstream metadata file.

### Init Script Package Appstream Data

To satisfy checkupdates web, an init script package needs to have a file called `org.artixlinux.services.{int system}.*.metainfo.xml` in the root of its repo. Consider this example:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<component type="service">
    <id>org.artixlinux.services.openrc.lirc</id>
    <metadata_license>CC0-1.0</metadata_license>
    <project_license>GPL-2.0</project_license>
    <name>lirc-openrc</name>
    <summary>openrc init script for lirc</summary>
    <categories>
        <category>System</category>
        <category>InitScript</category>
    </categories>
</component>
```

In the above example, the appstream file would be called `org.artixlinux.services.openrc.lirc.metainfo.xml`. The `metadata_license` is the license of this one xml file. `project_license` is the license of the **init script**.

The PKGBUILD should install this file to `/usr/share/metainfo/`.

### But it *Does* Have Appstream Data!

Perhaps the package is being flagged by nvchecker instead. It's unlikely for an init script to also have an nvchecker configuration file so checkupdates web assumes it's flagged due to appstream.
