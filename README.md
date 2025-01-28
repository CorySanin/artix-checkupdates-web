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
npm install
npm exec tsc
node distribution/index.mjs
```

## Docker Setup

Image : `registry.gitlab.com/sanin.dev/artix-packy-notifier`

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