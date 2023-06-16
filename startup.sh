#!/bin/bash
mkdir -p /usr/volume/packages ~/.config/artix-checkupdates
printf "ARTIX_MIRROR=$ARTIX_MIRROR\nARCH_MIRROR=$ARCH_MIRROR\n" > ~/.config/artix-checkupdates/config
R=$(echo "$CRON" | sed "s/\\//\\\\\\//g")
sed "s/%CRON%/$R/" cron > .cron
crontab /etc/cron.d/.cron
# cat /etc/cron.d/.cron
crond -n