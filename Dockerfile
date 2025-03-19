FROM artixlinux/artixlinux:base-devel AS baseimg

RUN pacman -Syu --noconfirm

FROM baseimg AS build-env

WORKDIR /usr/notifier

RUN pacman -Sy --noconfirm nodejs npm typescript

COPY package*.json ./

RUN npm install

COPY . .

RUN tsc && \
  npm run-script build && \
  npm ci --only=production


FROM baseimg AS deploy

VOLUME /usr/notifier/config
WORKDIR /usr/notifier
HEALTHCHECK  --timeout=15m \
  CMD curl --fail http://localhost:8081/healthcheck || exit 1

EXPOSE 8080

RUN pacman -Sy --noconfirm curl artools-pkg artix-checkupdates git nodejs npm openssh icu glibc openssl openssl-1.1 &&\
  mkdir -p /root/.config/artools/ /root/.cache/ && \
  useradd -m artix

COPY --from=build-env /usr/notifier /usr/notifier

RUN mkdir -p ./config /home/artix/.config/artix-checkupdates \
  /home/artix/.config/artools /home/artix/.cache/artix-checkupdates && \
  ln -sf /usr/notifier/config/artools-pkg.conf /home/artix/.config/artools/artools-pkg.conf && \
  ln -sf /usr/notifier/config/artix-checkupdates.conf /home/artix/.config/artix-checkupdates/config && \
  chown -R artix:artix /home/artix/ && \
  chown -R artix:artix .

USER artix

ENV ARTIX_MIRROR="https://mirror.sanin.dev/artix-linux/%s/os/x86_64/"
ENV ARCH_MIRROR="https://mirror.sanin.dev/arch-linux/%s/os/x86_64/"
ENV ARTIX_REPOS="system-goblins,world-goblins,galaxy-goblins,lib32-goblins,system-gremlins,world-gremlins,galaxy-gremlins,lib32-gremlins,system,world,galaxy,lib32"
ENV ARCH_REPOS="core-staging,extra-staging,multilib-staging,core-testing,extra-testing,multilib-testing,core,extra,multilib"

CMD [ "node", "distribution/index.mjs"]
