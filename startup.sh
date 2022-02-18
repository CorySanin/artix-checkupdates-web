#!/bin/bash
mkdir -p /usr/volume/packages /usr/volume/artools /usr/volume/ssh && \
buildtree -s
R=$(echo "$CRON" | sed "s/\\//\\\\\\//g")
sed "s/%CRON%/$R/" cron > .cron
crontab /etc/cron.d/.cron
crond -n