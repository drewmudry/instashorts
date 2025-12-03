FROM node:20-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY worker ./worker

RUN npm install -g pnpm && pnpm install

WORKDIR /app/worker
# RUN pnpm build

CMD ["pnpm", "start"]
