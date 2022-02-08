#!/bin/bash
mkdir -p /usr/volume/packages /usr/volume/artools /usr/volume/ssh && \
buildtree -s
crond -n