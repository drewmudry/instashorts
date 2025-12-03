FROM node:20-alpine

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install -g pnpm && pnpm install

COPY src ./src

RUN pnpm build

CMD ["pnpm", "start"]
