# Ayran — Modelagem UML

Diagramas do protótipo, em Mermaid (o GitHub e o VS Code com a extensão Mermaid exibem desenhado).
Fonte de verdade das decisões: [REQUIREMENTS.md](../REQUIREMENTS.md). O código manda: se algo divergir, corrija o diagrama.

Legenda de estado: **real** = funciona com dados reais; **exemplo** = usa dados de demonstração, marcados na tela.

## 1. Casos de uso

```mermaid
flowchart LR
  gestor(["Gestor / diretor"])
  func(["Funcionário"])
  admin(["Administrador"])

  subgraph Ayran
    chat["Conversar com a IA (texto)"]
    voz["Conversar por voz"]
    img["Criar imagens"]
    tar["Gerenciar tarefas e ideias"]
    mail["Ler e-mail e ver análise de golpe"]
    scam["Analisar e-mail suspeito"]
    agenda["Gerenciar agenda"]
    brief["Ouvir o resumo do dia"]
    notif["Receber notificações"]
    neg["Acompanhar indicadores do negócio"]
    skin["Escolher a interface"]
    team["Gerenciar equipe e acessos"]
    audit["Consultar auditoria (planejado)"]
  end

  gestor --> chat & voz & img & tar & mail & scam & agenda & brief & notif & neg & skin
  func --> chat & voz & img & tar & mail & agenda & notif & skin
  admin --> team & audit
  admin -. também .-> gestor
  mail -. inclui .-> scam
  brief -. usa .-> tar & mail & agenda
```

## 2. Componentes

```mermaid
flowchart TB
  subgraph Navegador["Navegador (React + Vite + Tailwind)"]
    App["App (estado, roteamento por aba)"]
    Skins["skins/ — Shell + Home por interface<br/>Ayran (escura) | Lia (clara)"]
    Telas["Telas: Chat, Criar, Tarefas, Ideias,<br/>E-mail, Agenda, Negócio, Equipe, Recursos"]
    Cards["Cartões compartilhados<br/>Briefing, Mail, Agenda, Tarefas, Notificações"]
    Voz["lib/localvoice.ts (gravação + fila de fala)"]
    App --> Skins --> Cards
    App --> Telas
    Telas --> Voz
  end

  subgraph Hub["Central (FastAPI, porta 3000, base /ayran)"]
    Auth["current_user (valida token no Open WebUI)"]
    Tasks["tarefas / ideias / settings"]
    Office["office.py — e-mail, agenda, negócio, resumo, notificações"]
    Scam["scam.py — analisador de golpes (regras)"]
    Samples["samples.py — dados de exemplo"]
    VoiceAPI["voice.py — Whisper + Piper"]
    Media["media.py — imagens (ComfyUI)"]
    Weather["weather.py — clima"]
    Team["team.py / account.py"]
    Office --> Scam
    Office --> Samples
  end

  OWUI["Open WebUI (login, chat, histórico)"]
  Ollama["Ollama (modelos de texto)"]
  Comfy["ComfyUI (Stable Diffusion + Real-ESRGAN)"]
  DB[("SQLite hub.db")]

  Navegador -->|HTTPS /ayran/api| Hub
  Navegador -->|/ayran/owui proxy| Hub
  Hub --> OWUI --> Ollama
  Media --> Comfy
  Hub --> DB
```

## 3. Modelo de domínio (classes)

```mermaid
classDiagram
  class User {
    +id
    +name
    +email
    +role: admin | user | pending
  }
  class Task {
    +id
    +title
    +details
    +due_date
    +status: pendente | andamento | concluida
    +idea_id
  }
  class Idea {
    +id
    +title
    +body
    +status
  }
  class Mail {
    +id
    +from_addr
    +subject
    +body
    +received_at
    +read
    +verdict: ok | warn | bad
    +score
    +demo
  }
  class ScamAnalysis {
    +verdict
    +score 0..100
    +reasons[]
    +positives[]
    +action
  }
  class Event {
    +id
    +title
    +start
    +end
    +place
    +demo
    +conflicts[]
  }
  class Notification {
    +id
    +kind: mail | tasks | agenda | briefing | business | dev
    +tone: bad | warn | info
    +source: real | exemplo
    +target
  }
  class Briefing {
    +greeting
    +sections[]
    +speak
  }
  class Skin {
    +id: ayran | lia
    +Shell
    +Home
  }
  class ImageJob {
    +id
    +prompt
    +template
    +width
    +height
    +status
  }

  User "1" --> "*" Task
  User "1" --> "*" Idea
  User "1" --> "*" Mail
  User "1" --> "*" Event
  User "1" --> "*" ImageJob
  Idea "0..1" --> "0..1" Task : vira
  Mail "1" --> "1" ScamAnalysis : analisado por scam.analyze
  Task ..> Notification : atrasada / vence hoje
  Mail ..> Notification : novo / suspeito
  Event ..> Notification : começa em até 90 min / conflito
  Briefing ..> Task : usa
  Briefing ..> Mail : usa
  Briefing ..> Event : usa
  User --> Skin : escolhe (localStorage)
```

## 4. Banco de dados (ER)

```mermaid
erDiagram
  TASKS {
    text id PK
    text user_id
    text title
    text due_date
    text status
    text idea_id
  }
  IDEAS {
    text id PK
    text user_id
    text title
    text status
  }
  MAILS {
    text id PK
    text user_id
    text from_addr
    text subject
    integer received_at
    integer read
    text verdict
    integer score
    text analysis
    integer demo
  }
  EVENTS {
    text id PK
    text user_id
    text title
    text start
    text end
    text place
    integer demo
  }
  OFFICE_SEED {
    text user_id PK
    text kind PK
  }
  SETTINGS {
    text user_id PK
    text data
  }
  USERS_OPEN_WEBUI ||--o{ TASKS : possui
  USERS_OPEN_WEBUI ||--o{ IDEAS : possui
  USERS_OPEN_WEBUI ||--o{ MAILS : possui
  USERS_OPEN_WEBUI ||--o{ EVENTS : possui
  USERS_OPEN_WEBUI ||--|| SETTINGS : tem
```

As contas ficam no Open WebUI; a Central guarda só o `user_id`. Ao **excluir** uma conta, `purge_user_data` apaga os dados dela; ao suspender, nada é apagado.

## 5. Sequência — chegada de e-mail e análise de golpe

```mermaid
sequenceDiagram
  actor U as Usuário
  participant FE as Home (MailCard)
  participant API as office.py
  participant S as scam.analyze
  participant DB as SQLite
  participant N as NotificationBell

  FE->>API: POST /api/mail/simulate (demonstração)
  API->>S: analyze(texto bruto)
  S-->>API: veredito, score, motivos
  API->>DB: insere e-mail + análise
  API-->>FE: e-mail novo
  FE->>N: evento ayran:notify
  N->>API: GET /api/notifications
  API-->>N: lista (e-mail suspeito em destaque)
  N-->>U: aviso flutuante "E-mail com cara de golpe"
  U->>FE: abre o e-mail
  FE->>API: POST /api/mail/{id}/read
  U->>FE: "Criar tarefa de verificação"
  FE->>API: POST /api/tasks
```

Com o Microsoft 365 / Gmail conectado, só a origem das mensagens (`simulate`) é trocada por um provedor real (Graph API / Gmail API); análise, notificações e telas não mudam.

## 6. Sequência — conversa por voz

```mermaid
sequenceDiagram
  actor U as Usuário
  participant UI as Chat / VoiceCall
  participant L as localvoice.ts
  participant V as voice.py
  participant OW as Open WebUI + Ollama

  U->>UI: "Falar com o Ayran"
  UI->>L: listenLocal()
  L->>L: grava e detecta fim da fala (silêncio)
  L->>V: POST /api/voice/stt (áudio)
  V-->>L: texto (Whisper)
  L-->>UI: texto final
  UI->>OW: chat/completions (stream)
  OW-->>UI: resposta em partes
  loop a cada frase completa
    UI->>L: speaker.enqueue(frase)
    L->>V: POST /api/voice/tts (Piper)
    V-->>L: áudio WAV
    L-->>U: toca a frase
  end
  UI->>L: volta a ouvir
```

## 7. Sequência — resumo do dia para o diretor

```mermaid
sequenceDiagram
  actor D as Diretor
  participant B as BriefingCard
  participant API as office.py
  participant DB as SQLite
  participant V as voice.py

  D->>B: abre a Home
  B->>API: GET /api/briefing
  API->>DB: tarefas concluídas ontem, atrasadas, hoje
  API->>DB: e-mails de risco, não lidos
  API->>DB: compromissos de hoje e conflitos
  API-->>B: seções (real) + andamento de projetos (exemplo) + texto para fala
  D->>B: "Ouvir o resumo"
  B->>V: POST /api/voice/tts (em trechos)
  V-->>D: voz lendo o resumo
```

## 8. Estados

```mermaid
stateDiagram-v2
  [*] --> NaoLido: e-mail chega
  NaoLido --> Lido: abrir
  NaoLido --> Apagado: apagar
  Lido --> Apagado: apagar
  Apagado --> [*]

  state "Veredito (definido na chegada)" as V {
    [*] --> Seguro: score < 25
    [*] --> Suspeito: 25 ≤ score < 60
    [*] --> ProvavelGolpe: score ≥ 60
  }
```

```mermaid
stateDiagram-v2
  [*] --> pendente
  pendente --> andamento
  andamento --> concluida
  pendente --> concluida
  concluida --> pendente: reabrir
```

## 9. Implantação

```mermaid
flowchart LR
  subgraph Internet
    U["Usuário (navegador / celular)"]
    CF["Cloudflare DNS + Worker ayran-proxy"]
  end
  subgraph Servidor["Notebook-servidor (Windows)"]
    T["cloudflared (túnel de saída, 7844)"]
    H["Central :3000 (127.0.0.1)"]
    O["Open WebUI :8080"]
    L["Ollama :11434"]
    C["ComfyUI :8188"]
  end
  U --> CF --> T --> H
  H --> O --> L
  H --> C
```

Nenhuma porta de entrada é aberta: tudo fica em `127.0.0.1` e o acesso externo é só pelo túnel de saída.

## 10. Estrutura de interfaces (skins)

```mermaid
classDiagram
  class App {
    skin: SkinId
    tab: Tab
    changeSkin()
  }
  class Shell {
    <<interface>>
    nav, header, children
  }
  class AyranShell {
    foto em tela cheia
    menu lateral em cápsula
  }
  class LiaShell {
    barra de comando Ctrl+K
    dock flutuante
    grade de pontos
  }
  class Home {
    <<interface>>
  }
  class AyranHome
  class LiaHome {
    bento: foto + escudo + agenda
    faixa de indicadores
  }
  App --> Shell
  App --> Home
  Shell <|.. AyranShell
  Shell <|.. LiaShell
  Home <|.. AyranHome
  Home <|.. LiaHome
```

Para criar um modelo novo (ou um por cliente): pasta em `hub/frontend/src/skins/<nome>/` com `Shell` e `Home`, uma entrada em `skins/index.tsx` e outra em `lib/skin.ts`.

## 11. Princípios de usabilidade aplicados

| Princípio | Como aparece no produto |
| --- | --- |
| Visibilidade do estado | Carregando, vazio e erro em toda lista; "Ouvindo / Pensando / Falando" na voz; sino com contagem |
| Honestidade | Tudo que é demonstração leva a etiqueta "Exemplo" ou "Dados de exemplo" |
| Controle do usuário | Confirmação antes de apagar; "Mover para depois" em conflito de agenda; Esc fecha painéis |
| Reconhecimento, não memória | Atalhos na Home, dock/menu com ícones e nomes, filtros com contagem |
| Prevenção de erros | Fim antes do início bloqueado no formulário; links desativados em e-mail suspeito |
| Acessibilidade | Rótulos em campos, `aria-live` nos avisos, foco visível, não depende só de cor (ícone + texto) |
| Consistência | Cartões, chips e cabeçalhos únicos (`ui.tsx`); mesmos dados nas duas interfaces |
| Eficiência | Ctrl/⌘+K na Lia, criação rápida de tarefa na Home, voz em qualquer tela |
