FROM node:22-alpine AS build
WORKDIR /workspace
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm install
COPY apps/api apps/api
COPY packages/database packages/database
RUN npm run build -w @worksphere/database && npm run build -w @worksphere/api

FROM node:22-alpine
WORKDIR /workspace
ENV NODE_ENV=production

# Ensure workspace ownership belongs to non-root node user (uid: 1000, gid: 1000)
COPY --from=build --chown=node:node /workspace/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist apps/api/dist
COPY --from=build --chown=node:node /workspace/packages/database packages/database
COPY --from=build --chown=node:node /workspace/package.json ./package.json

USER node

CMD ["node", "apps/api/dist/server.js"]
