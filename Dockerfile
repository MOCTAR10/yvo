FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.html styles.css premium.css sw.js manifest.webmanifest icon.svg icon-192.png icon-512.png apple-touch-icon.png ./
COPY js ./js
COPY img ./img
COPY server ./server
EXPOSE 8080
USER node
CMD ["node", "server/server.js"]
