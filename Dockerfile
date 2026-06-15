FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_BASE=/shopfloor/
RUN VITE_BASE=$VITE_BASE npm run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY server ./server
COPY scripts ./scripts
COPY database ./database
EXPOSE 3001
CMD ["node", "server/index.js"]
