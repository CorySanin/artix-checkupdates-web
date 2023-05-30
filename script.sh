#!/bin/bash
echo " ~cron job started~ "
cd /usr/files
checkupdates > checkupdates.txt
cat checkupdates.txt
node index.js
echo "job finished."