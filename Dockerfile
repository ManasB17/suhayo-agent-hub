FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY agent-hub.mjs web-server.mjs host-runner.mjs ./
COPY src ./src
COPY public ./public
COPY config.example.json ./config.example.json
RUN cp config.example.json config.json \
    && mkdir -p data \
    && chown -R node:node /app
USER node
EXPOSE 4317
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4317/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "web-server.mjs"]
