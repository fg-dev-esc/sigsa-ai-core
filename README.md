```
_____/\\\\\\\\\_____/\\\\\\\\\\\______________________/\\\\\\\\\_______/\\\\\_________/\\\\\\\\\______/\\\\\\\\\\\\\\\
 ___/\\\\\\\\\\\\\__\/////\\\///____________________/\\\////////______/\\\///\\\_____/\\\///////\\\___\/\\\///////////_
  __/\\\/////////\\\_____\/\\\_____________________/\\\/_____________/\\\/__\///\\\__\/\\\_____\/\\\___\/\\\____________
   _\/\\\_______\/\\\_____\/\\\______/\\\\\\\\\\\__/\\\______________/\\\______\//\\\_\/\\\\\\\\\\\/____\/\\\\\\\\\\\____
    _\/\\\\\\\\\\\\\\\_____\/\\\_____\///////////__\/\\\_____________\/\\\_______\/\\\_\/\\\//////\\\____\/\\\///////_____
     _\/\\\/////////\\\_____\/\\\___________________\//\\\____________\//\\\______/\\\__\/\\\____\//\\\___\/\\\____________
      _\/\\\_______\/\\\_____\/\\\____________________\///\\\___________\///\\\__/\\\____\/\\\_____\//\\\__\/\\\____________
       _\/\\\_______\/\\\__/\\\\\\\\\\\__________________\////\\\\\\\\\____\///\\\\\/_____\/\\\______\//\\\_\/\\\\\\\\\\\\\\\
        _\///________\///__\///////////______________________\/////////_______\/////_______\///________\///__\///////////////_

```

# SIGSA AI Core

Servicio IA desacoplado del backend para capturar póliza, nombre y apellido desde texto, audio o imagen.

## Arquitectura

```mermaid
flowchart LR
  UI[UI WhatsApp local] -->|texto/audio/imagen| FB[fake-backend]
  FB -->|POST /events| API[ai-core API]
  API -->|enqueue| Q[(Redis + BullMQ)]
  Q --> W[identity-worker]
  W -->|GET /cases/CASE-DEMO-001| FB
  W -->|GET /media/:mediaId/download| FB
  W --> G[Groq API]
  W -->|POST /identity-intake-result| FB
  FB -->|respuesta o pregunta| UI
```

## Flujo Demo

```mermaid
sequenceDiagram
  participant U as Usuario
  participant UI as UI WhatsApp
  participant B as fake-backend
  participant A as ai-core
  participant Q as BullMQ
  participant W as identity-worker
  participant G as Groq

  U->>UI: Envía texto, audio o imagen
  UI->>B: POST /demo/messages
  B->>A: POST /events
  A->>Q: enqueue identity-intake job
  A-->>B: 202 accepted
  B-->>UI: mensaje aceptado
  Q->>W: job
  W->>B: GET /cases/CASE-DEMO-001
  B-->>W: mensajes del caso demo
  W->>B: GET /media/:mediaId/download
  B-->>W: audio o imagen, si aplica
  W->>G: transcripción / visión / extracción
  G-->>W: identidad extraída
  W->>W: validación determinística
  W->>B: POST /identity-intake-result
  B->>UI: confirmación o pregunta faltante
```

```bash
npm install
```

```bash
docker compose up -d redis
```


```bash
npm run dev:fake-backend
```


```bash
npm run dev:ai-core
```


```bash
npm run dev:identity-worker
```

```
ngrok http 3000
```

```txt
http://localhost:4000/whatsapp
```

```bash
curl.exe http://localhost:4000/identity-intake-results
```

El worker devuelve:

```txt
complete
```

```txt
needs_input
```