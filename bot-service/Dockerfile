FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# DejaVu fallback + bundled Montserrat/Open Sans for HQ flyers
RUN apk add --no-cache font-dejavu
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY assets ./assets
EXPOSE 3001
CMD ["node", "dist/index.js"]
