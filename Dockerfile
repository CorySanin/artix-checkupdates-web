FROM gitea.artixlinux.org/artixdocker/artixlinux:base-devel as checkupdates

WORKDIR /usr/checkupdates

RUN pacman -Sy --noconfirm git make clang gcc && \
  git clone https://gitea.artixlinux.org/Qontinuum/checkupdates.git . && \
  sed -i 's/list_moves(arch_h/printf("\\n");list_moves(arch_h/g' src/main.c && \
  make

FROM gitea.artixlinux.org/artixdocker/artixlinux:base-devel

VOLUME /usr/volume
WORKDIR /usr/files

RUN sed -i 's:\[system]:[gremlins]\nInclude = /etc/pacman.d/mirrorlist\n\n[system]:' /etc/pacman.conf &&\
  sed -i 's:\[world]:[world-gremlins]\nInclude = /etc/pacman.d/mirrorlist\n\n[world]:' /etc/pacman.conf &&\
  pacman -Syu --noconfirm &&\
  pacman -Sy --noconfirm artools-pkg git nodejs npm cronie-openrc openssh icu glibc openssl openssl-1.1 &&\
  mkdir -p /root/.config/artools && \
  mkdir -p /root/.cache && \
  ln -sf /usr/files/.cron /etc/cron.d/.cron && \
  rm -rf /root/.ssh && \
  ln -sf /usr/volume/ssh /root/.ssh && \
  rm -rf /root/.config/artools && \
  ln -sf /usr/volume/artools /root/.config/artools && \
  ln -sf /usr/volume/packages /root/artools-workspace && \
  echo 'GPGKEY="0"' > /root/.makepkg.conf

COPY . .
COPY --from=checkupdates /usr/checkupdates/checkupdates /usr/bin/

RUN chmod 0644 ./* && \
  chmod +x ./*.sh && \
  npm install

ENV CRON="*/30 * * * *"

CMD ./startup.sh