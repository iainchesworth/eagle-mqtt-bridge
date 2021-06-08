# stage 1: copy the source and build the app



# stage 2: copy the output and run it in production

FROM node:16-alpine

RUN apk add dumb-init

ENV NODE_ENV production

WORKDIR /app

COPY *.js* /app

RUN npm ci --only=production

USER node

CMD [ "dumb-init", "npm", "start" ]
