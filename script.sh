#!/bin/bash
echo " ~cron job started~ "
cd /usr/files
buildtree -s
comparepkg -u > comparepkg.txt
cat comparepkg.txt
cp comparepkg.txt /usr/volume
echo "job finished."