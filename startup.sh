#!/bin/bash
printf "GIT_TOKEN=$GITEA_TOKEN\n" > ~/.config/artools/artools-pkg.conf
printf "ARTIX_MIRROR=$ARTIX_MIRROR\nARCH_MIRROR=$ARCH_MIRROR\nARTIX_REPOS=$ARTIX_REPOS\nARCH_REPOS=$ARCH_REPOS" "%s" "%s" > ~/.config/artix-checkupdates/config && \
node index.js