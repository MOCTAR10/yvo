FROM node:22-alpine
WORKDIR /app
COPY index.html styles.css premium.css sw.js manifest.webmanifest icon.svg icon-192.png icon-512.png apple-touch-icon.png ./
COPY js ./js
COPY img ./img
COPY server ./server
ENV PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
