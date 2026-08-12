# Guide d'installation et configuration d'Ollama

Ce guide vous explique comment héberger Ollama sur un serveur cloud pour utiliser l'IA dans l'application de génération de sites de réservation.

## 🎯 Pourquoi Ollama ?

- **Gratuit** : Pas de coût par requête, seulement l'hébergement du serveur
- **Open Source** : Modèles libres et modifiables
- **Performant** : Peut tourner sur des instances cloud standards
- **API simple** : Facile à intégrer

## 📦 Option 1 : Installation sur serveur cloud (recommandé)

### Prérequis
- Un serveur cloud (AWS EC2, DigitalOcean, Hetzner, OVH, etc.)
- Ubuntu 20.04+ ou Debian 11+
- Au moins 4GB de RAM (8GB recommandé pour les gros modèles)
- Accès SSH

### Installation sur Ubuntu/Debian

```bash
# 1. Se connecter au serveur
ssh user@votre-serveur.com

# 2. Installer Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 3. Télécharger un modèle (exemples)
ollama pull llama3.2        # ~2GB - Modèle rapide et léger
ollama pull llama3.1:8b     # ~4.6GB - Bon équilibre
ollama pull mistral          # ~4.1GB - Très performant
ollama pull codellama        # ~3.8GB - Bon pour le code

# 4. Vérifier que ça fonctionne
ollama list
ollama run llama3.2 "Bonjour, ça marche ?"
```

### Configuration pour accès distant

Par défaut, Ollama écoute seulement sur `localhost`. Pour l'exposer sur le réseau :

```bash
# 1. Modifier la variable d'environnement
export OLLAMA_HOST=0.0.0.0:11434

# 2. Pour que ça persiste au redémarrage, ajouter dans ~/.bashrc ou créer un service systemd
echo 'export OLLAMA_HOST=0.0.0.0:11434' >> ~/.bashrc
source ~/.bashrc

# 3. Redémarrer Ollama
sudo systemctl restart ollama
```

### Créer un service systemd (recommandé)

```bash
# Créer le fichier de service
sudo nano /etc/systemd/system/ollama.service
```

Contenu du fichier :
```ini
[Unit]
Description=Ollama Service
After=network.target

[Service]
Type=simple
User=ollama
Environment="OLLAMA_HOST=0.0.0.0:11434"
ExecStart=/usr/local/bin/ollama serve
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
# Activer et démarrer le service
sudo systemctl daemon-reload
sudo systemctl enable ollama
sudo systemctl start ollama
sudo systemctl status ollama
```

### Configuration du firewall

```bash
# Autoriser le port 11434
sudo ufw allow 11434/tcp
sudo ufw reload
```

### Sécurité (optionnel mais recommandé)

Pour protéger votre instance Ollama :

1. **Utiliser un reverse proxy avec authentification** (Nginx + Basic Auth)
2. **Restreindre l'accès par IP** (firewall)
3. **Utiliser HTTPS** avec un certificat SSL

Exemple avec Nginx :

```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://localhost:11434;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Basic Auth (optionnel)
        auth_basic "Ollama API";
        auth_basic_user_file /etc/nginx/.htpasswd;
    }
}
```

## 📦 Option 2 : Installation locale (développement)

Pour tester en local avant de déployer :

```bash
# macOS
brew install ollama
ollama serve

# Linux
curl -fsSL https://ollama.com/install.sh | sh
ollama serve

# Windows
# Télécharger depuis https://ollama.com/download
```

## 🔧 Configuration dans l'application

### Variables d'environnement

Créez un fichier `.env` à la racine du projet :

```env
# URL de votre instance Ollama
VITE_OLLAMA_URL=http://votre-serveur.com:11434

# Modèle à utiliser (doit être téléchargé sur le serveur)
VITE_OLLAMA_MODEL=llama3.2
```

### Modèles recommandés

| Modèle | Taille | RAM min | Qualité | Usage |
|--------|--------|---------|---------|-------|
| `llama3.2` | ~2GB | 4GB | ⭐⭐⭐ | Développement, tests |
| `llama3.1:8b` | ~4.6GB | 8GB | ⭐⭐⭐⭐ | Production légère |
| `mistral` | ~4.1GB | 8GB | ⭐⭐⭐⭐ | Production |
| `codellama` | ~3.8GB | 8GB | ⭐⭐⭐⭐⭐ | Génération de code |

## 🚀 Déploiement sur différents providers

### DigitalOcean Droplet

1. Créer un Droplet Ubuntu 22.04 (4GB RAM minimum)
2. Se connecter en SSH
3. Suivre les étapes d'installation ci-dessus
4. Coût : ~$24/mois pour 4GB RAM

### AWS EC2

1. Lancer une instance EC2 (t3.medium ou plus)
2. Installer Ollama
3. Configurer le Security Group pour ouvrir le port 11434
4. Coût : ~$30-50/mois selon l'instance

### Hetzner Cloud

1. Créer un serveur CX21 (4GB RAM)
2. Installer Ollama
3. Coût : ~€5/mois (très économique !)

### OVH Public Cloud

1. Créer une instance B2-7 (7GB RAM)
2. Installer Ollama
3. Coût : ~€10-15/mois

## 🧪 Tester la connexion

```bash
# Depuis votre machine locale
curl http://votre-serveur.com:11434/api/tags

# Devrait retourner la liste des modèles installés
```

## 📊 Monitoring

Pour surveiller l'utilisation :

```bash
# Voir les modèles téléchargés
ollama list

# Voir l'utilisation des ressources
htop
# ou
docker stats  # si utilisé avec Docker
```

## 🔄 Mise à jour

```bash
# Mettre à jour Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Mettre à jour un modèle
ollama pull llama3.2
```

## 🐳 Option Docker (alternative)

Si vous préférez Docker :

```bash
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
docker exec -it ollama ollama pull llama3.2
```

## ⚠️ Troubleshooting

### Ollama ne répond pas
```bash
# Vérifier le service
sudo systemctl status ollama

# Vérifier les logs
sudo journalctl -u ollama -f

# Redémarrer
sudo systemctl restart ollama
```

### Erreur CORS
Si vous avez des erreurs CORS depuis le frontend, ajoutez dans votre configuration Ollama ou utilisez un reverse proxy.

### Modèle trop lent
- Utilisez un modèle plus petit (`llama3.2` au lieu de `llama3.1:70b`)
- Augmentez la RAM du serveur
- Utilisez un GPU si disponible

## 📝 Notes importantes

1. **Sécurité** : Ne laissez jamais Ollama ouvert publiquement sans protection
2. **Performance** : Les modèles plus gros = meilleure qualité mais plus lent
3. **Coûts** : Seulement l'hébergement du serveur, pas de coût par requête
4. **Backup** : Les modèles sont stockés dans `~/.ollama`, pensez à les sauvegarder

## 🔗 Ressources

- [Documentation Ollama](https://github.com/ollama/ollama)
- [Liste des modèles](https://ollama.com/library)
- [API Reference](https://github.com/ollama/ollama/blob/main/docs/api.md)




