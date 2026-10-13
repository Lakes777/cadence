# Imagem do Cadence (API + telas no mesmo processo) em três etapas. As duas primeiras rodam na
# arquitetura de quem monta ($BUILDPLATFORM, o PC x86), sem emulação: o resultado é JavaScript,
# igual em qualquer processador. Só a última é da arquitetura da VM (arm64).

# 1. Compila a API (Nest + cliente do Prisma) e as telas (Vite)
FROM --platform=$BUILDPLATFORM node:24-alpine AS compilacao
WORKDIR /app
# Primeiro só os manifestos: enquanto eles não mudarem, o Docker reaproveita o npm ci
COPY package.json package-lock.json ./
RUN npm ci
COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci
COPY . .
RUN npx prisma generate && npm run build && cd web && npm run build

# 2. Só as dependências de produção, já com os pacotes opcionais do processador da VM
# (o msgpackr do BullMQ tem um binário por plataforma; sem ele, cai no JavaScript puro)
FROM --platform=$BUILDPLATFORM node:24-alpine AS dependencias
ARG TARGETARCH
WORKDIR /app
COPY package.json package-lock.json ./
RUN cpu=$([ "$TARGETARCH" = amd64 ] && echo x64 || echo "$TARGETARCH") \
	&& npm ci --omit=dev --ignore-scripts --os=linux --cpu="$cpu" --libc=musl

# 3. A imagem final: Node, as dependências de produção e o build
FROM node:24-alpine
ARG COMMIT=desconhecido
LABEL org.opencontainers.image.revision=$COMMIT
WORKDIR /app
ENV NODE_ENV=production PORTA=3000 PASTA_DAS_TELAS=/app/telas \
	NODE_OPTIONS=--max-old-space-size=160
COPY --from=dependencias /app/node_modules node_modules
COPY --from=compilacao /app/dist dist
COPY --from=compilacao /app/web/dist telas
COPY package.json ./
# O usuário "node" já vem na imagem: o processo não roda como root
USER node
EXPOSE 3000
# Sem curl nem wget: o próprio Node confere a saúde
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:3000/saude').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
