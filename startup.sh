#!/bin/bash
echo "Artix Packy Notifier"
echo "cron schedule: $CRON"
mkdir -p /usr/volume/packages ~/.config/artix-checkupdates
printf "ARTIX_MIRROR=$ARTIX_MIRROR\nARCH_MIRROR=$ARCH_MIRROR\n" "%s" "%s" > ~/.config/artix-checkupdates/config
R=$(echo "$CRON" | sed "s/\\//\\\\\\//g")
sed "s/%CRON%/$R/" cron > .cron
crontab /etc/cron.d/.cron
crond -f