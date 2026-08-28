FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --no-audit --no-fund

RUN npx prisma generate

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
