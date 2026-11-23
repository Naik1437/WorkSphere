FROM node:22-alpine AS build
WORKDIR /workspace
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm install
COPY apps/web apps/web
RUN npm run build -w @worksphere/web

FROM node:22-alpine
WORKDIR /workspace
ENV NODE_ENV=production

# Ensure standalone and cache directories are owned by non-root node user (uid: 1000, gid: 1000)
COPY --from=build --chown=node:node /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./.next/static
COPY --from=build --chown=node:node /workspace/apps/web/.next/static ./apps/web/.next/static

RUN mkdir -p .next/cache && chown -R node:node /workspace

USER node
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
