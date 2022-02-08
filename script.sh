#!/bin/bash
echo " ~cron job started~ "
cd /usr/files
buildtree -s
comparepkg -u > comparepkg.txt
cat comparepkg.txt
node index.js
echo "job finished."