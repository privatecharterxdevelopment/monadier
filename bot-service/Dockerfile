FROM node:20-alpine AS build
WORKDIR /app
ARG GIT_COMMIT=unknown
ENV GIT_COMMIT=$GIT_COMMIT
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ARG GIT_COMMIT=unknown
ENV NODE_ENV=production
ENV GIT_COMMIT=$GIT_COMMIT
# Short-primary book — override per deploy in Railway if needed
ENV HL_DIRECTION_PROFILE=bear_market
ENV HL_ALLOW_LONG_OPENS=false
# DejaVu fallback + bundled Montserrat/Open Sans for HQ flyers
RUN apk add --no-cache font-dejavu
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY assets ./assets
EXPOSE 3001
CMD ["node", "dist/index.js"]
