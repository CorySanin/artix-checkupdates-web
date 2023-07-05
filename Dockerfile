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

CMD ./startup.sh