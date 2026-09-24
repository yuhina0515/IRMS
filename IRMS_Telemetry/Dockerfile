FROM node:24-alpine
WORKDIR /app
COPY server.mjs ./
ENV DATA_DIR=/data NODE_ENV=production
USER node
EXPOSE 8120
CMD ["node", "server.mjs"]
