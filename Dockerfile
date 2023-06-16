FROM gitea.artixlinux.org/artixdocker/artixlinux:base-devel

VOLUME /usr/volume
WORKDIR /usr/files

RUN \
  #sed -i 's:\[system]:[gremlins]\nInclude = /etc/pacman.d/mirrorlist\n\n[system]:' /etc/pacman.conf &&\
  #sed -i 's:\[world]:[world-gremlins]\nInclude = /etc/pacman.d/mirrorlist\n\n[world]:' /etc/pacman.conf &&\
  pacman -Syu --noconfirm &&\
  pacman -Sy --noconfirm artools-pkg artix-checkupdates git nodejs npm cronie-openrc openssh icu glibc openssl openssl-1.1 &&\
  mkdir -p /root/.config/artools && \
  mkdir -p /root/.cache && \
  ln -sf /usr/files/.cron /etc/cron.d/.cron

COPY . .

RUN chmod 0644 ./* && \
  chmod +x ./*.sh && \
  npm install

ENV CRON="*/30 * * * *"
ENV ARTIX_MIRROR="https://mirrors.qontinuum.space/artixlinux/%s/os/x86_64"
ENV ARCH_MIRROR="https://mirrors.qontinuum.space/archlinux/%s/os/x86_64"

CMD ./startup.sh