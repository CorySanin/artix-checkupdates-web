# artix-packy-notifier

Notify me when one of my packages needs maintaining

mount a folder to `/usr/volume`.

Inside the volume, create a `packages.json` with the following schema:

| Variable        | Description                                                                                                           |
|-----------------|-----------------------------------------------------------------------------------------------------------------------|
| PREVIOUS        | The path to store the generated list of actionable packages. Defaults to `previous.json` in the mounted volume.       |
| packages        | An array of packages to look for pending operations for.                                                              |
| writeAllPending | Boolean. If all pending packages should be included in the PREVIOUS file. Provided as `allPackages` and `allMovable`. |
| apprise.api     | The url of the Apprise server to use for sending notifications. For example, "http://192.168.1.123:8000"              |
| apprise.urls    | An array of Apprise destination URLs to deliver notifications to. For example, "tgram://bot-token/chat-id"            |

The following environment variables should be supplied.

| Variable     | Description                                |
|--------------|--------------------------------------------|
| CRON         | The cron schedule for checking for updates |
| ARTIX_MIRROR | The Artix mirror to use                    |
| ARCH_MIRROR  | The Arch mirror to use                     |
| ARTIX_REPOS  | The Artix repos to check                   |
| ARCH_REPOS   | The Arch repos to check                    |