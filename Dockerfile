FROM artixlinux/openrc:latest

WORKDIR /usr/files

RUN pacman -Sy --noconfirm artools-pkg nodejs npm cronie-openrc openssh icu &&\
  mkdir -p /root/.config/artools && \
  ln -sf /usr/files/cron /etc/cron.d/cron && \
  ln -sf /usr/volume/ssh /root/.ssh && \
  rm -rf /root/.config/artools && \
  ln -sf /usr/volume/artools /root/.config/artools && \
  ln -sf /usr/volume/packages /root/artools-workspace

COPY . .

RUN chmod 0644 ./* && \
  chmod +x ./*.sh && \
  npm install && \
  crontab /etc/cron.d/cron

#WORKDIR /usr/volume

CMD ./startup.sh