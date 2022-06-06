FROM artixlinux/base:latest

WORKDIR /usr/files

RUN pacman -Syu --noconfirm &&\
  pacman -Sy --noconfirm artools-pkg nodejs npm cronie-openrc openssh icu glibc &&\
  mkdir -p /root/.config/artools && \
  ln -sf /usr/files/.cron /etc/cron.d/.cron && \
  ln -sf /usr/volume/ssh /root/.ssh && \
  rm -rf /root/.config/artools && \
  ln -sf /usr/volume/artools /root/.config/artools && \
  ln -sf /usr/volume/packages /root/artools-workspace && \
  echo 'GPGKEY="0"' > /root/.makepkg.conf

COPY . .

RUN chmod 0644 ./* && \
  chmod +x ./*.sh && \
  npm install

#WORKDIR /usr/volume

ENV CRON="*/30 * * * *"

CMD ./startup.sh