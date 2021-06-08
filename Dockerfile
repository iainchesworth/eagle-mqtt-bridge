# stage 1: copy the source and build the app



# stage 2: copy the output and run it in production

FROM node:lts-alpine

RUN apk add dumb-init

ENV NODE_ENV production

WORKDIR /usr/src/app

COPY --chown=node:node . .

RUN npm ci --only=production

USER node

CMD [ "dumb-init", "npm", "start" ]
