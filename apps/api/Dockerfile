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
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist apps/api/dist
COPY --from=build /workspace/packages/database packages/database
COPY --from=build /workspace/package.json ./package.json
CMD ["node", "apps/api/dist/server.js"]
