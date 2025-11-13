FROM node:18-alpine

LABEL maintainer="LoxBerry Community"
LABEL description="Smart Irrigation System for Loxone"
LABEL version="1.5.0"

RUN apk add --no-cache sqlite curl tzdata

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY bin/ ./bin/
COPY webfrontend/ ./webfrontend/

RUN mkdir -p /app/data /app/config /app/backups /app/logs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/api/zones || exit 1

ENV NODE_ENV=production PORT=3000 TZ=Europe/Vienna

CMD ["node", "bin/server.js"]
