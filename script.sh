#!/bin/bash
echo " ~cron job started~ "
cd /usr/files
buildtree -s
comparepkg -m > movable.txt
printf "\n=== MOVABLE ===\n"
cat movable.txt
comparepkg -u > comparepkg.txt
printf "\n=== UPGRADABLE ===\n"
cat comparepkg.txt
node index.js
echo "job finished."