# Stage 1: Build the Vite React Frontend
FROM node:20-alpine AS builder

WORKDIR /usr/src/app
COPY package*.json ./

# Install all dependencies (dev included for Vite build)
RUN npm install

# Build the Frontend static bundle
COPY . .
RUN npm run build

# Stage 2: Create Production Server Runtime
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy package config and install PROD modules
COPY package*.json ./
RUN npm install --omit=dev

# Copy backend files and the freshly compiled frontend UI
COPY --from=builder /usr/src/app/server ./server
COPY --from=builder /usr/src/app/dist ./dist

# Provide environment variables natively or via Volume mapping later
ENV PORT=3031
ENV NODE_ENV=production
ENV DB_PATH=/usr/src/app/server/data/database.sqlite
ENV RUSTDESK_KEY_PATH=/usr/src/app/rustdesk-data/id_ed25519.pub

# Expose backend API and GUI
EXPOSE 3031

# Create the data and rustdesk-data folders
RUN mkdir -p /usr/src/app/server/data /usr/src/app/rustdesk-data /usr/src/app/logs

# Run the raw Node instance
CMD ["node", "server/index.js"]
