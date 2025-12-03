FROM node:20-slim

# Install dependencies for Remotion (Chromium + FFmpeg)
RUN apt-get update && apt-get install -y \
    chromium \
    ffmpeg \
    fonts-liberation \
    fonts-noto-color-emoji \
    fonts-freefont-ttf \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json tsconfig.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install

# Download Chrome Headless Shell during build
RUN npx -y -p @remotion/cli remotion browser ensure

COPY src ./src

RUN pnpm build

CMD ["pnpm", "start"]
