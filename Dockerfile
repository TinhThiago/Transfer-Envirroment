FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci && mkdir /data && chown node:node /data
COPY --chown=node:node src ./src
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100 DATABASE_PATH=/data/transfer.db
USER node
EXPOSE 3100
VOLUME ["/data"]
CMD ["npm", "start"]
