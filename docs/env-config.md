# Configuration des variables d'environnement

## Fichier .env

Créez un fichier `.env` à la racine du projet avec les variables suivantes :

```env
# Configuration Supabase (existant)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key

# Configuration Ollama (nouveau)
# URL de votre instance Ollama (local ou serveur cloud)
VITE_OLLAMA_URL=http://localhost:11434

# Modèle Ollama à utiliser (doit être téléchargé sur le serveur)
# Options: llama3.2, llama3.1:8b, mistral, codellama, etc.
VITE_OLLAMA_MODEL=llama3.2
```

## Exemples de configuration

### Développement local
```env
VITE_OLLAMA_URL=http://localhost:11434
VITE_OLLAMA_MODEL=llama3.2
```

### Serveur cloud (exemple)
```env
VITE_OLLAMA_URL=http://votre-serveur.com:11434
VITE_OLLAMA_MODEL=llama3.1:8b
```

### Sans Ollama (mode simulation)
Si vous ne configurez pas Ollama, l'application utilisera automatiquement le mode simulation.




