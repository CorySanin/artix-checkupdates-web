FROM gitea.artixlinux.org/artixdocker/artixlinux:base-devel

VOLUME /usr/volume
WORKDIR /usr/files

RUN pacman -Syu --noconfirm &&\
  pacman -Sy --noconfirm artools-pkg artix-checkupdates git nodejs npm cronie-openrc openssh icu glibc openssl openssl-1.1 &&\
  mkdir -p /root/.config/artools/ /root/.cache/ && \
  ln -sf /usr/files/.cron /etc/cron.d/.cron

COPY . .

RUN chmod 0644 ./* && \
  chmod +x ./*.sh && \
  npm install

ENV CRON="*/30 * * * *"
ENV ARTIX_MIRROR="https://mirrors.qontinuum.space/artixlinux/%s/os/x86_64"
ENV ARCH_MIRROR="https://mirrors.qontinuum.space/archlinux/%s/os/x86_64"
ENV ARTIX_REPOS="system-goblins,world-goblins,lib32-goblins,system-gremlins,world-gremlins,lib32-gremlins,system,world,lib32"
ENV ARCH_REPOS="core-staging,extra-staging,multilib-staging,core-testing,extra-testing,multilib-testing,core,extra,multilib"

CMD ./startup.sh