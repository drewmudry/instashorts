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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY renderer ./renderer

RUN npm install -g pnpm && pnpm install

# Download Chrome Headless Shell during build (needs to be in renderer dir or global?)
# Remotion browser ensure usually checks locally.
WORKDIR /app/renderer
RUN npx -y -p @remotion/cli remotion browser ensure

# RUN pnpm build

CMD ["pnpm", "start"]
