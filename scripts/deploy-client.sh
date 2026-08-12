#!/bin/bash
set -e

# ============================================================================
# Promptly - Script de déploiement client
# ============================================================================
# Usage: ./scripts/deploy-client.sh <CLIENT_ID> <PORT> <CONFIG_JSON>
# ============================================================================

CLIENT_ID=$1
PORT=$2
CONFIG_JSON=$3

if [ -z "$CLIENT_ID" ] || [ -z "$PORT" ] || [ -z "$CONFIG_JSON" ]; then
  echo "❌ Usage: ./deploy-client.sh <CLIENT_ID> <PORT> <CONFIG_JSON>"
  exit 1
fi

# Configuration
BASE_DIR="${PROMPTLY_BASE_DIR:-/opt/promptly-saas}"
CLIENT_DIR="$BASE_DIR/clients/$CLIENT_ID"
TEMPLATE_DIR="$BASE_DIR/templates/barber"
VPS_IP="${VPS_IP:-localhost}"

echo "🚀 Déploiement du client: $CLIENT_ID"
echo "📂 Dossier: $CLIENT_DIR"
echo "🔌 Port: $PORT"

# 1. Créer la structure client
echo "📁 Création de la structure..."
mkdir -p "$CLIENT_DIR/volumes/config"
mkdir -p "$CLIENT_DIR/logs"

# 2. Copier le template
echo "📋 Copie du template..."
if [ -d "$TEMPLATE_DIR" ]; then
  cp -r "$TEMPLATE_DIR"/* "$CLIENT_DIR/" 2>/dev/null || true
else
  echo "⚠️  Template non trouvé à $TEMPLATE_DIR, utilisation du dossier courant"
  # Copier les fichiers essentiels depuis le dossier courant
  for item in src public index.html package.json vite.config.ts tsconfig.json tailwind.config.ts postcss.config.js; do
    if [ -e "$item" ]; then
      cp -r "$item" "$CLIENT_DIR/"
    fi
  done
fi

# 3. Injecter config.json
echo "⚙️  Injection de la configuration..."
echo "$CONFIG_JSON" > "$CLIENT_DIR/volumes/config/config.json"

# 4. Générer docker-compose.yml
echo "🐳 Génération du docker-compose.yml..."
cat > "$CLIENT_DIR/docker-compose.yml" <<EOF
services:
  web:
    image: promptly-template:latest
    container_name: client-$CLIENT_ID
    restart: unless-stopped
    volumes:
      - ./volumes/config:/app/src/config:ro
    environment:
      - VITE_SUPABASE_URL=\${SUPABASE_URL}
      - VITE_SUPABASE_PUBLISHABLE_KEY=\${SUPABASE_KEY}
      - NODE_ENV=production
    ports:
      - "$PORT:5173"
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.client-$CLIENT_ID.rule=Host(\`client-$CLIENT_ID.$VPS_IP.nip.io\`)"
EOF

# 5. Installer les dépendances
echo "📦 Installation des dépendances..."
cd "$CLIENT_DIR"
if [ -f "package.json" ]; then
  npm install --silent
fi

# 6. Lancer le conteneur
if [ "$ENABLE_DOCKER" = "true" ]; then
  echo "🐳 Démarrage du conteneur Docker..."
  docker compose up -d
  
  # Attendre que le conteneur soit prêt
  echo "⏳ Attente du démarrage..."
  sleep 5
  
  # Vérifier le statut
  if docker ps | grep -q "client-$CLIENT_ID"; then
    echo "✅ Conteneur démarré avec succès"
  else
    echo "❌ Erreur: Le conteneur n'a pas démarré"
    docker logs "client-$CLIENT_ID" 2>&1 | tail -20
    exit 1
  fi
else
  echo "ℹ️  Mode dev: Docker désactivé"
fi

# 7. Configurer Nginx (si disponible et activé)
if [ "$ENABLE_NGINX" = "true" ] && command -v nginx &> /dev/null; then
  echo "🌐 Configuration de Nginx..."
  SUBDOMAIN="client-$CLIENT_ID.$VPS_IP.nip.io"
  
  cat > "/etc/nginx/sites-available/client-$CLIENT_ID.conf" <<EOF
server {
    listen 80;
    server_name $SUBDOMAIN;
    
    location / {
        proxy_pass http://localhost:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

  ln -sf "/etc/nginx/sites-available/client-$CLIENT_ID.conf" "/etc/nginx/sites-enabled/"
  nginx -t && nginx -s reload
  
  echo "✅ Nginx configuré pour: http://$SUBDOMAIN"
else
  echo "ℹ️  Nginx désactivé ou non disponible"
fi

# 8. Résumé
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║   ✅ DÉPLOIEMENT RÉUSSI                                ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "📋 Client ID: $CLIENT_ID"
echo "🔌 Port: $PORT"
if [ "$ENABLE_NGINX" = "true" ]; then
  echo "🌐 URL: http://client-$CLIENT_ID.$VPS_IP.nip.io"
else
  echo "🌐 URL: http://localhost:$PORT"
fi
echo "📂 Dossier: $CLIENT_DIR"
echo ""
echo "📝 Commandes utiles:"
echo "   - Logs: docker logs -f client-$CLIENT_ID"
echo "   - Restart: docker restart client-$CLIENT_ID"
echo "   - Stop: docker stop client-$CLIENT_ID"
echo ""

exit 0
