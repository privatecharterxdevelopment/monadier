# Build bot-service from monorepo root (Railway Root Directory must be empty).
FROM node:20-alpine AS build
WORKDIR /app
COPY bot-service/package.json bot-service/package-lock.json ./
RUN npm ci --include=dev
COPY bot-service/tsconfig.json ./
COPY bot-service/src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY bot-service/package.json bot-service/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index.js"]
