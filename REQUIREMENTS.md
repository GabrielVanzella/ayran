# minhaIA — Requisitos do Projeto

> IA local, própria, rodando em casa, com modelos abertos que eu possa entender e modificar.
> Documento levantado em 2026-08-25, pra retomar o setup de casa.

## Identidade

- **Nome**: Ayran
- **Gênero/voz**: masculino
- **Dono/administrador**: Gabriel
- **Usuários**: personalizada pro Gabriel e pros projetos dele, mas **outras pessoas também vão usar** (atualizado em 2026-10-09 — antes era uso pessoal exclusivo)

## Objetivo geral

Ter uma IA pessoal que:
- Roda 100% local (sem depender de assinatura/API paga, uso ilimitado)
- Usa modelos abertos, que eu possa inspecionar e adaptar
- Integra com meus próprios projetos de código
- Eventualmente reconhece minha voz e executa comandos
- Eventualmente gera imagem e vídeo
- Serve também como forma de aprender como IA funciona de verdade, do zero

## Arquitetura: um só ponto de entrada, vários modelos por trás

Eu (Gabriel) só converso com o **Ayran**, num lugar só (chat/hub — Fase 2.5). Por trás, um roteador (Fase 7) decide qual modelo especializado usar pra cada pedido, sem eu precisar escolher manualmente:

| Tipo de pedido | Modelo usado |
|---|---|
| Conversa / dia a dia (rápido, padrão pra todos os usuários) | `qwen3.5:4b` (cabe inteiro na GPU de 4 GB) |
| Conversa / dia a dia (melhor qualidade, mais lento) | `qwen3.5:9b` |
| Código (pesado, principal pra desenvolvimento) | `qwen3.6:35b-a3b-coding` (MoE, ~3B ativos, roda em RAM+GPU) |
| Autocomplete de código no VS Code | `qwen2.5-coder:1.5b` |
| Embeddings pro RAG (busca nos meus documentos, multilíngue) | `bge-m3` |
| Escrita criativa (admin, selecao manual) | Dolphin 3.0 Mistral 24B (`GFalcon-UA/dolphin3-mistral`, quant Q4 ~13 GB) |
| Raciocínio complexo (lógica/matemática) | Modelo de raciocínio (DeepSeek-R1/QwQ) |
| Gerar imagem | Stable Diffusion/SDXL (Fase 4) |
| Gerar vídeo | Modelo de vídeo (Fase 5) |
| Comando de voz | Pipeline STT → um dos modelos acima |
| Tarefa complexa demais pro local | Escala pro Claude (Fase 6.5) |

## Situação de hardware

### Servidor atual (provisório) — notebook, confirmado em 2026-10-09
- CPU: Intel Core i9-11950H (8 núcleos / 16 threads)
- RAM: 32 GB
- GPU: **NVIDIA T1200 Laptop, 4 GB VRAM** (driver 580, CUDA ok) + Intel UHD integrada
- Disco: ~410 GB livres no C:
- SO: Windows 11 Pro
- Fica **ligado 24/7** como servidor do Ayran até o PC de casa ficar pronto
- Implicações:
  - Texto/chat: modelos até ~4B inteiros na GPU (rápido); 7-8B com offload parcial pra RAM (usável, ~5-12 tok/s); 13-14B só em CPU (lento)
  - Imagem: viável (SD 1.5 razoável, SDXL lento mas possível com 4 GB)
  - STT (Whisper): acelera com GPU
  - Vídeo: ainda inviável com 4 GB VRAM
  - Fine-tuning: só QLoRA leve em modelos pequenos

### Servidor definitivo — PC de casa (em montagem)
- Perfil: intermediário, verba limitada, tem que durar e **atender clientes** (API da Fase 1.6)
- Proposta de peças passada em 2026-10-09 (prioridade: VRAM da GPU > RAM > resto; plataforma AM5 pra upgrade; fonte e placa-mãe preparadas pra 2ª GPU no futuro). Specs finais a definir após orçamento
- Domínio: **vztecnologia.com.br** (registro.br, em processamento em 2026-10-09) → Cloudflare Tunnel
- Toda a configuração precisa ser **portável** (scripts/config versionados no repo) pra migrar sem refazer tudo
- Upgrade considerado: GPU com mais VRAM (ex: RTX 3060 12GB) e/ou aluguel de GPU por hora (RunPod/Vast.ai) para tarefas pesadas pontuais (vídeo, fine-tuning)

## Fases do projeto

### Fase 1 — Assistente de texto local (base de tudo)
- [x] Instalar Ollama (0.40.1)
- [x] Baixar modelos definidos em 2026-10-09 (ver tabela da "Arquitetura"): `qwen3.5:4b`, `qwen3.5:9b`, `qwen3.6:35b-a3b-coding`, `qwen2.5-coder:1.5b`, `bge-m3`
- [x] Baixar modelo "uncensored" para escrita criativa (`dolphin3`, 8B) — **só para o admin**, fora do roteador automático (outros usuários não podem acessar)
- [x] Baixar Dolphin 3.0 Mistral 24B — **só para o admin**, opcao manual fora do roteador automatico
- [x] Testar via terminal/API (qwen3.5:4b ~19 tok/s; qwen3.6 coding ~14 tok/s, ~40s pra carregar)
- [x] Instalar Open WebUI (0.11.4, venv em `%USERPROFILE%\ayran-server`, scripts em `server/`)

### Fase 1.5 — Servidor 24/7, multiusuário, API e acesso remoto (adicionado em 2026-10-09)
Arquitetura: tudo roda na máquina servidora; só a camada com autenticação fica exposta.

```
[usuários / meus projetos, de qualquer lugar] ──► túnel (HTTPS) ──► Open WebUI (contas + chaves de API) ──► Ollama (só localhost)
```

- [ ] Máquina como servidor: não suspender/hibernar na tomada, tampa fechada = não fazer nada, Ollama e Open WebUI iniciando com o Windows (sem precisar de login)
- [ ] Notebook 24/7: limitar carga da bateria (~60-80%, via BIOS/utilitário do fabricante) e cuidar de temperatura/ventilação
- [ ] Windows Update: horário ativo + reinício controlado, serviços voltam sozinhos depois do reboot
- [x] Ollama **nunca exposto direto** (não tem autenticação) — escuta só em `127.0.0.1:11434`
- [ ] Multiusuário: contas no Open WebUI (eu = admin, cadastro de novos usuários só com aprovação)
- [ ] API pros meus projetos: chave de API por usuário/projeto no Open WebUI, endpoint compatível com OpenAI (`/api/chat/completions`)
- [ ] Acesso remoto:
  - [ ] Cloudflare Tunnel — endereço público HTTPS pra usuários e projetos externos (sem abrir porta no roteador)
  - [ ] Tailscale — acesso administrativo privado (eu)
- [ ] Portabilidade: scripts de instalação/config versionados no repo, backup dos dados do Open WebUI (usuários, chats, chaves) pra migrar pro PC de casa
- [ ] Documentar como os projetos consomem a API (exemplos Python/JS)

### Requisitos levantados em 2026-10-09 (Gabriel é programador)
- **Foco principal: ajudar no desenvolvimento de código** — modelo de código forte + integração com o VS Code
- **Boa comunicação** — conversa natural em português
- **Home própria com chat, personalizada pra mim** — de início, Open WebUI com marca do Ayran (nome, logo, modelo "Ayran" com persona); depois, o hub próprio da Fase 2.5
- **Conversar com a IA** — por texto (chat) e por voz (modo de chamada de voz do Open WebUI como solução imediata; assistente de voz completo na Fase 3)
- **Conexão com o VS Code** — de imediato via extensão Continue apontando pra API do Ayran (chat + autocomplete); depois, extensão própria (Fase 2.5)
- **Abastecer sempre com informação** — base de conhecimento contínua (RAG): coleções de documentos no Open WebUI agora, banco vetorial na Fase 7
- **Treinar cada vez mais** — ciclo de fine-tuning periódico (Fase 6); fazer no PC de casa ou em GPU alugada (4 GB de VRAM só aguenta QLoRA muito pequeno)
- **Passar o conhecimento do Claude dos meus projetos pro Ayran**:
  - [ ] Importar pro RAG os `CLAUDE.md`, `REQUIREMENTS.md`, docs e memórias (`~/.claude/projects/*/memory/`) de cada projeto
  - [ ] Script de sincronização periódica (projetos → base de conhecimento do Ayran)
  - [ ] Atenção: os termos da Anthropic restringem usar respostas do Claude pra treinar modelos concorrentes — usar **RAG** com meus próprios documentos é ok; antes de fazer fine-tuning com transcrições de conversas do Claude, revisar os termos
- **Ajudar a cuidar da minha empresa — uma software house**. Detalhes a levantar (tamanho da equipe, plataforma git, gestão de projetos, sistemas usados). Dados da empresa e código de clientes ficam locais; separar por permissão o que cada usuário vê (ex: base de conhecimento por cliente/projeto)
  - Usos prováveis: assistente de código pra equipe (VS Code), revisão de código, documentação técnica, propostas/orçamentos/escopo, base de conhecimento dos projetos de clientes, onboarding de devs
  - **Limite de capacidade**: o notebook atende bem 1 pessoa por vez no modelo de código (requisições simultâneas entram em fila). Equipe usando ao mesmo tempo → modelo de código pesado pra mim, modelo leve pra equipe, e dimensionar a GPU do PC de casa pensando em vários usuários
- **Geração de vídeo** — inviável no notebook (4 GB VRAM); planejar no PC de casa com GPU de 12-16 GB+ ou GPU alugada (Fase 5)

### Fase 2 — Customização (deixar a IA "minha")
- [ ] Criar Modelfile próprio (system prompt definindo o Ayran como assistente masculino, personalidade, parâmetros) em cima do modelo base
- [ ] Montar RAG — dar acesso aos meus próprios documentos/notas/projetos como contexto
- [ ] Montar tool calling / agentes — conectar a IA a funções/scripts reais (rodar comandos, consultar meus projetos, etc.), no mesmo padrão de agentes tipo Claude Code
  - [ ] Ferramenta de histórico de trabalho: consultar `git log` de um projeto por período (ex: "o que eu fiz ontem no projeto X") — precisa de um mapeamento nome do projeto → caminho da pasta
  - [ ] Ferramenta de resumo de redes sociais: Instagram, Facebook, LinkedIn (+ outra a confirmar) via API oficial de cada plataforma — **somente leitura/resumo**, sem publicar ou responder automaticamente

### Fase 2.5 — Central do Ayran (pedido em 2026-10-09: "algo bem top")
Uma central própria da minha IA, **acessível de qualquer lugar** (web/PWA no celular e no PC; depois empacotada como app desktop), com:
- [x] Chat com o Ayran (roteador automático — sem escolher modelo), streaming, histórico (salvo no Open WebUI)
- [x] Notícias (IA, tech/dev, negócios, Brasil — Google News/TabNews/HN/g1; "Briefing do Ayran")
- [x] Ideias (kanban nova/andamento/feita; "Desenvolver com Ayran")
- [ ] Tarefas pessoais independentes por usuário: título, detalhes opcionais, prazo, status e exclusão; conversão de ideias em tarefas fica para depois
- [x] Player de música (Spotify embed, fixo na barra inferior)
- [x] Login com a mesma conta do Open WebUI (Open WebUI vira o motor/admin por trás)
- Implementação v0.1: `hub/` (backend FastAPI + frontend React/Vite/Tailwind), porta 3000, `server/start-hub.ps1`
- [ ] Mostrar na central qual especialista respondeu (hoje só aparece no Open WebUI)
- [ ] Comunicação por voz na central: falar com o Ayran (STT) e ouvir respostas (TTS)
- [x] Publicada em **vztecnologia.com.br/ayran** (Cloudflare: DNS + Worker `ayran-proxy` + Tunnel `ayran`; ver `server/cloudflare/`, `server/start-tunnel.ps1`)

#### Escopo de uso (definido em 2026-10-13)
O Ayran ajuda o Gabriel na **vida pessoal e no trabalho**, e vai **cuidar da VZ Tecnologia e dos projetos**. Usuários no momento: **Gabriel + funcionários**. Regra de ouro: **vida pessoal nunca fica visível pra equipe**.
- Três espaços de dados separados:
  1. **Pessoal** (só o dono): notas, ideias pessoais, memória de longo prazo, conversas — nunca entra no conhecimento compartilhado
  2. **Empresa** (equipe): documentação, padrões da VZ, `CLAUDE.md`/docs dos projetos (RAG compartilhado), ideias da empresa
  3. **Por projeto/cliente**: cada funcionário só consulta os projetos em que trabalha
- Papéis: **admin** (Gabriel) vê tudo e usa modos exclusivos (`/dolphin`); **funcionário** usa chat, código, imagem e a base da empresa, sem acesso ao pessoal do dono
- **Funcionários têm acesso a tudo que o Gabriel tem, exceto algumas coisas** (as exceções serão informadas por ele durante o desenvolvimento). Por isso as permissões devem ser **configuráveis por recurso e por papel** num lugar só (uma tabela de recursos × papéis), pra liberar/bloquear sem mexer em código
- [ ] Tabela de permissões por recurso (chat, código, imagem, vídeo, modo criativo, base da empresa, API/gateway, painel avançado…) × papel; começa tudo liberado, exceto o espaço pessoal do dono
- [x] **Criação de acessos pelo dono** (2026-10-13): aba **Equipe** (só admin) — criar funcionário (senha provisória gerada + mensagem pronta pro WhatsApp, mostrada uma vez), gerar nova senha, promover/rebaixar, remover. Cadastro aberto já está desligado: ninguém se cadastra sozinho. Backend `hub/backend/team.py`
- [ ] **Redis** (limitação do Open WebUI): sem ele, trocar a senha **não derruba sessões já abertas** (valem até 4 semanas, `JWT_EXPIRES_IN`). "Remover acesso" corta na hora. Ao migrar pro PC novo, instalar Redis (ou reduzir a validade da sessão pra 7 dias)
- Já é por usuário hoje: conversas (Open WebUI), ideias, preferências (cidade, playlist, cena), galeria de imagens
- [ ] Base de conhecimento da empresa (RAG) separada da pessoal, com permissão por grupo/projeto
- [ ] Decidir e avisar a equipe: o admin do Open WebUI pode ler as conversas dos usuários (`ENABLE_ADMIN_CHAT_ACCESS`); desligar se a política for privacidade total
- [ ] Memória de longo prazo por usuário (Fase 7) — a do Gabriel isolada da dos funcionários
- [ ] Ayran "toma conta" da VZ: acompanhar projetos (git log, ideias, prazos), resumo diário pro dono (ver "Resumo do dia")

#### Visual v2 — "experiência personalizada" (pedido em 2026-10-13)
Referências: dashboard de casa inteligente em vidro fosco (Smartiva) + paisagem em hero com painéis translúcidos por cima. **Design Read**: painel de comando de IA pessoal, para dono/equipe de software house, linguagem de vidro fosco sobre cena desfocada (pedido explícito, apesar do skill desaconselhar glassmorphism como padrão).
- [x] Sistema visual: uma paleta (cinza-azulado + gelo), raio único (cartões 28px, controles em pílula), ícones de traço fino, fonte Outfit, painel flutuante com navegação em cápsula e barra de topo com busca
- [x] **Tema que muda com o clima**: Open-Meteo (grátis, sem chave) → cena de fundo: praia (≥ 28 °C), pôr do sol, nublado, chuva, tempestade, neblina, noite, frio. Cenas geradas pelo próprio gerador de imagens (`server/generate-scenes.py`)
- [x] Cidade por busca ou "usar minha localização", salva por usuário; o usuário pode fixar uma cena (ou deixar "Automático")
- [x] Tela inicial: relógio, clima agora, previsão de 7 dias, medidor circular do servidor (VRAM/RAM), serviços, conversas por dia (dados reais), notícias e ideias
- [x] Cena em **tela cheia e nítida** (sem moldura), com painéis de vidro escuro por cima; cenas aumentadas de 768×512 para 2400×1600 com Real-ESRGAN x4 (`server/upscale-scenes.py`). Nas telas de leitura (chat, notícias…) o fundo fica desfocado pra não atrapalhar o texto
- [x] **Fundo = vista da cidade do usuário** (pedido em 2026-10-13: "não quero imagens fixas"): o Ayran gera, uma vez por cidade e por clima, uma vista com o perfil urbano + entorno natural, aumenta a resolução e guarda em cache (`hub/backend/cityscenes.py`). Enquanto gera (~3 min neste notebook) vale a cena genérica. O dono pode **descrever a vista** (a IA não conhece a geografia de cada cidade) e as imagens são recriadas. É inspirada na cidade, **não é foto real**
- [x] Regra de cena por clima corrigida: calor pela sensação térmica, "dia claro", pôr do sol só perto do nascer/pôr do sol real (Open-Meteo)
- [x] Serviços se religam sozinhos: tarefa do Windows tenta iniciar a cada 5 min (`install-autostart.ps1`). Atenção: **registrar as tarefas de novo derruba as que estão rodando**; religar depois
- [ ] Cenas geradas direto em alta resolução (SDXL no PC novo, 1920×1080) — o upscale melhora mas não cria detalhe novo
- [ ] Resumo do dia feito pelo Ayran (clima + ideias + notícias)
- [ ] Aplicar o mesmo acabamento às telas Chat, Criar, Notícias, Ideias e Música (hoje só herdam o material e a paleta)

### Fase 1.6 — Ayran como produto: API de IA para clientes da software house (pedido em 2026-10-09)
Contexto: clientes da software house querem IA nos sistemas deles. Hoje a gente compra crédito de API de terceiros e integra. Ideia: **o Ayran fornece a chave de API** e o cliente **recarrega crédito com a gente**.
- [ ] Gateway de API com chave por cliente, limite de gasto (créditos) e medição de uso por token
- [ ] Recarga de créditos (Pix/cartão) e painel do cliente (saldo, consumo)
- [ ] Roteamento por cliente: modelos locais (custo fixo) e/ou provedores externos (pagos por token) por trás da mesma chave
- [ ] Capacidade: notebook atual NÃO aguenta produção de clientes — definir infra (PC de casa com GPU forte e/ou GPU na nuvem) antes de vender
- [ ] Revisar termos dos provedores sobre revenda de acesso e LGPD (dados dos clientes passando pelo Ayran)

Itens originais da fase:
- [ ] Decidir stack de empacotamento: **Tauri** (recomendado — leve, frontend em HTML/CSS/JS) ou Electron (100% JS, mais pesado)
- [ ] Frontend de chat consumindo a API local do Ollama diretamente (HTTP)
- [ ] Painel de status: voz ativa, automação residencial, últimas ações do Ayran
- [ ] Ícone na bandeja do sistema + atalho de teclado global pra abrir
- [ ] Iniciar junto com o Windows (autostart)
- [x] **Ayran como agente de código no VS Code, "igual ao Claude"** (pedido em 2026-10-09):
  - [x] Modelo `ayran-code` (qwen3.6 coding, contexto 32K) — `server/modelfiles/ayran-code.Modelfile`; tool calling testado
  - [x] Guia de trabalho (práticas de agente: ler antes de editar, mudanças pequenas, verificar, cuidado com ações destrutivas) — `server/vscode/ayran-code-rules.md`
  - [x] Cline (agente: lê/edita arquivos, roda terminal com aprovação) + Continue (chat lateral, Ctrl+I, autocomplete), os dois com o guia
  - [ ] RAG com o conhecimento dos projetos (CLAUDE.md, docs) — ver "Passar o conhecimento do Claude"
  - Limite: não transfere a inteligência do Claude (pesos), só práticas e contexto; no notebook é ~14 tok/s
- [ ] Extensão do VS Code própria — Ayran dentro do editor (TypeScript, API de extensões do VS Code)
  - [ ] Painel lateral de chat (Webview), reaproveitando a UI do hub central
  - [ ] Acesso ao contexto do editor (arquivo aberto, seleção, workspace)
  - [ ] Comandos customizados na paleta (ex: "Ayran: explicar", "Ayran: corrigir")
  - [ ] Edição de arquivo direto pelo Ayran
  - [ ] Uso local/privado, sem necessidade de publicar na Marketplace

### Fase 3 — Assistente de voz ("Jarvis" caseiro)
- [ ] Wake word (ex: `openWakeWord`) — detecção de palavra de ativação
- [ ] STT — Speech to Text (Whisper local) — transcrever minha fala
- [ ] Ligar transcrição → LLM local com tool calling (Fase 2)
- [ ] TTS — Text to Speech (ex: Kokoro-82M — líder em eficiência em 2026, ou Piper como alternativa) — resposta falada, com voz masculina em português (opcional)
- [ ] Domótica/automação residencial — comandos de voz controlando dispositivos reais
  - [ ] Instalar Home Assistant (hub open-source, local, integra com a maioria das marcas)
  - [ ] Adquirir dispositivos inteligentes (tomadas/lâmpadas — Tuya/Smart Life ou Zigbee)
  - [ ] Criar tools que conectam o LLM ao Home Assistant (ex: `ligar_luz(comodo)`, `criar_rotina(nome)`)
  - [ ] Rotina exemplo: "olá [nome], deixa o escritório pronto" → dispara várias ações de uma vez (luz, música, etc.)

### Fase 4 — Geração de imagem (iniciada em 2026-10-09, "mesmo que seja limitado e demore")
- [x] Avaliar necessidade de GPU — notebook (4 GB) roda SD 1.5; SDXL/Flux só no PC novo
- [x] Instalar ComfyUI como servidor local (127.0.0.1:8188, `--lowvram`, `server/start-comfyui.ps1`)
- [x] Baixar modelo aberto — DreamShaper 8 (SD 1.5, licença CreativeML OpenRAIL-M, permite uso comercial)
- [x] Aba **Criar → Imagem** na central: prompt em português (o Ayran traduz/melhora pro inglês), formatos, estilos, galeria, download
- [x] Fila de geração (uma por vez) + liberar a GPU do Ollama antes de gerar
- [x] Filtro de conteúdo: bloquear pedidos sexuais explícitos e qualquer coisa envolvendo menores (servidor multiusuário da empresa)
- [x] Testar geração local (2026-10-09: paisagem 768x512, 25 passos, ~36s incluindo tradução do prompt)
- **Vídeo (Fase 5) já preparado na mesma arquitetura**: aba **Criar → Vídeo** fica desabilitada até detectar GPU com ≥16 GB; quando a placa de 24 GB chegar, só adicionar o workflow/modelo de vídeo

### Fase 5 — Geração de vídeo
- [ ] Decidir caminho: comprar GPU vs. alugar GPU na nuvem por hora
- [ ] Avaliar modelos abertos disponíveis no momento (CogVideoX, HunyuanVideo, LTX-Video, ou o que for atual)

### Fase 6.5 — Modo híbrido (opcional): escalar para Claude quando necessário
- [ ] Ferramenta `perguntar_claude(pergunta)` — chama a API da Anthropic para tarefas complexas demais pro modelo local
- [ ] Para tarefas de código/projeto pesadas, considerar disparar uma sessão de Claude Code via linha de comando como ferramenta do Ayran
- [ ] **Trade-off**: quebra parcialmente o "ilimitado e grátis" — API é paga por uso (tokens). Usar só como escalonamento pontual, não como padrão

### Fase 6 — Fine-tuning (aprendizado avançado)
- [ ] Aprender base de Python + Hugging Face `transformers`
- [ ] Fazer um fine-tuning leve (LoRA/QLoRA) com dados próprios, num modelo pequeno
- [ ] (Opcional, longo prazo) Estudar arquitetura Transformer a fundo (paper "Attention Is All You Need", série do Andrej Karpathy construindo um GPT do zero)
- [ ] Ciclo de melhoria contínua do Ayran (não é aprendizado em tempo real — o modelo não muda durante a conversa; é um processo deliberado e periódico):
  - [ ] Feedback 👍/👎 nas respostas, virando dataset de correções
  - [ ] Rodar novo fine-tuning (LoRA) periodicamente incorporando esse feedback
  - [ ] Revisar/trocar o modelo base conforme saem versões melhores (ver "Descobertas recentes" abaixo)
- [ ] **IA treinando IA** (pedido em 2026-10-09) — ciclo automático professor → aluno:
  1. Professor (`qwen3.6` 35B, Apache 2.0) gera respostas para tarefas reais da VZ Tecnologia (dados sintéticos)
  2. Filtro: testes automáticos (código que compila/passa), IA juíza dando nota (RLAIF/DPO) e revisão humana por amostragem
  3. As melhores viram dataset → LoRA no modelo menor (ex: `qwen3.5:4b`) = destilação
  4. Benchmark antes/depois; só promove o novo modelo se melhorou
  - Geração de dados roda no notebook (lento); o treino precisa da GPU de 24 GB ou GPU alugada
  - **Restrição**: professor só pode ser modelo cuja licença permita (Qwen/Apache ok). Respostas do Claude, ChatGPT ou Gemini **não** podem virar dado de treino (termos de uso proíbem)
  - Primeiro objetivo sugerido: deixar o modelo de 4B melhor em responder sobre os projetos da VZ

### Fase 7 — Técnicas avançadas para maximizar a inteligência
- [ ] Modelo de raciocínio (reasoning model) para tarefas complexas — ex: DeepSeek-R1 destilado ou QwQ — "pensa" passo a passo antes de responder, mais preciso em lógica/matemática/código (mais lento, mas não exige mais memória)
- [ ] RAG avançado com banco vetorial (embeddings) — ex: ChromaDB ou Qdrant, local — busca semântica de verdade, não só palavra-chave
- [ ] Memória de longo prazo — Ayran lembra fatos/preferências/histórico entre sessões, mesmo princípio da memória do Claude
- [x] Roteamento de modelos (v0.1, 2026-10-09: `server/functions/ayran_router.py` — conversa/raciocínio/código) — modelo pequeno/rápido para perguntas simples, modelo de raciocínio (ou escalar pro Claude, Fase 6.5) só quando a tarefa for complexa
- [ ] Orquestração multi-agente — modelos/instâncias especializadas colaborando (planeja / executa / revisa) em vez de um modelo genérico fazendo tudo
- [ ] Adotar MCP (Model Context Protocol) como padrão de ferramentas — protocolo aberto para conectar a IA a ferramentas/dados de forma padronizada, em vez de solução caseira

## Descobertas recentes (pesquisado em 2026-08-25)

- **BitNet / quantização 1-bit (Microsoft)** — pesos reduzidos a 3 valores possíveis (-1, 0, 1), permite rodar modelos bem maiores em CPU puro com bem menos RAM. Modelo `Bonsai 8B` (abr/2026) roda em ~1GB. **É a tecnologia mais relevante pra minha situação (CPU sem GPU) — acompanhar de perto.**
- **Phi-4-mini-instruct** (Microsoft, 3.8B, ~4GB RAM, contexto de 128K) e **Qwen3.5-0.8B** (multimodal, Apache 2.0) — novas opções pequenas e fortes pra CPU, substituem a recomendação antiga de Qwen2.5/Llama 3.2
- **Qwen3** — família que virou o padrão geral pra rodar localmente (1.7B a 235B, licença livre)
- **Kokoro-82M** — novo líder em eficiência entre TTS locais, boa opção pra Fase 3 além do Piper
- **NVIDIA Parakeet TDT** e **Silero VAD v5** — alternativas ao Whisper para transcrição/detecção de voz
- **MCP spec 2026-07-28** — protocolo migrou de stateful pra stateless, facilitando escalar agentes
- Topo absoluto do mercado aberto hoje: **Kimi K3** (2.8T parâmetros) e **GLM-5.2** — grandes demais pro meu hardware atual, relevantes só se usar cloud rental no futuro

## Stack técnica resumida

| Componente | Ferramenta |
|---|---|
| Runtime de modelo de texto | Ollama |
| Interface de chat (rápida, genérica) | Open WebUI |
| Interface personalizada (hub central) | Tauri (frontend HTML/CSS/JS) |
| Modelos de texto | Qwen3.5 (4B/9B), Qwen3.6 coding (35B-A3B), Qwen2.5-Coder 1.5B (autocomplete) — ver "Arquitetura" |
| Embeddings (RAG) | bge-m3 |
| VS Code (imediato) | Extensão Continue → API do Ayran |
| Modelo criativo admin-only | Dolphin 3 (`dolphin3`, Llama 3.1 8B) e Dolphin 3.0 Mistral 24B (`GFalcon-UA/dolphin3-mistral`) |
| STT (voz → texto) | Whisper (local) |
| TTS (texto → voz) | Piper |
| Wake word | openWakeWord |
| Automação residencial | Home Assistant |
| Redes sociais (leitura/resumo) | APIs oficiais (Meta Graph API p/ Instagram e Facebook, LinkedIn API) + outra a definir |
| Geração de imagem | ComfyUI + Stable Diffusion/SDXL/Flux |
| Geração de vídeo | A definir na Fase 5 (depende de GPU disponível na época) |
| Fine-tuning | Hugging Face `transformers` + LoRA/QLoRA |

## Notas e responsabilidades

- Modelos "uncensored" (Dolphin e similares) não recusam pedidos — inclui liberdade criativa legítima, mas também remove proteções contra conteúdo genuinamente prejudicial. Responsabilidade de uso é minha, não do modelo.
- Nenhum peso de modelo (arquivos `.gguf`, `.safetensors`, etc.) deve ir pro git — são arquivos de vários GB, baixados sob demanda por cada ferramenta (Ollama, ComfyUI). Ver `.gitignore`.

## Referência: conceitos aprendidos até aqui

- Como um LLM funciona (tokens, pesos, transformer/atenção, pré-treino → instruction tuning → RLHF)
- Como modelos de imagem/vídeo funcionam (difusão: remover ruído gradualmente guiado por texto)
- Camadas de "adaptar" uma IA pronta: prompt → RAG → tool calling/agentes → fine-tuning (LoRA) → re-treino do zero (inviável para indivíduo)
- Diferença entre treino (caro, feito uma vez pelo laboratório) e inferência (rodar o modelo pronto, barato — é o que fazemos localmente)

### Registro de 2026-10-13 (tarde) — o que mudou e o que aprendemos
- [x] **Aba Criar aceita imagem de referência** (Ctrl+V, arrastar ou escolher arquivo) + 3 níveis de "quanto se parecer" (img2img, `workflows/image_sd15_img2img.json`). Com referência o gerador **não aceita nudez/sexual nem menores** — checado no texto, na imagem enviada e na gerada (`safety.py`: ViT Falconsai na CPU; se a verificação falhar, recusa). A referência é apagada ao fim do trabalho
- [x] **Minha conta**: trocar a senha pela Central (`account.py`); mantém a entrada automática do servidor em dia
- [x] **O Ayran sabe quem está falando**: o roteador injeta nome e papel de quem conversa (antes tratava todos como o Gabriel) e que a VZ tem equipe. Nunca revela conversa de uma pessoa a outra
- [x] **Funcionário comum agora consegue conversar com o Ayran**: o modelo precisava de acesso público de leitura (`server/publish-model.py`). Antes só administradores viam o modelo ("Model not found"). Rodar de novo após reinstalar o Open WebUI
- [x] Espera tolerante: o ComfyUI travava a consulta quando a GPU de 4 GB ficava sem VRAM (modelo de texto + imagem juntos); os trabalhos de imagem agora esperam em vez de falhar
- [x] Notebook-servidor **não dorme mais na bateria** (antes dormia em 3 min; ficou em espera de 13h36 às 15h22 e derrubou o túnel). Tampa fechada = não faz nada, na tomada e na bateria
- [ ] Douglas foi criado como **Administrador**: admin vê a aba Equipe (cria/remove acessos), usa o modo `/dolphin` e pode ler conversas de todos. Rebaixar para Funcionário se não for a intenção
- [ ] A criação de acesso pela aba Equipe deve deixar **Funcionário** como padrão visível e pedir confirmação ao escolher Administrador
- [x] **Modelos de imagem e tamanho personalizado** (pedido em 2026-10-13): 10 modelos prontos (Instagram 1080², retrato 4:5, Story/Reels 1080×1920, miniatura YouTube, LinkedIn/Facebook, X, Pinterest, logo/avatar, banner de site, papel de parede) + tamanho livre de 256 a 2048 px (até ~4 MP, proporção até 4:1). O Ayran gera na proporção certa (SD 1.5, até 768 px) e amplia com Real-ESRGAN até o tamanho exato, cortando no centro se preciso. Cada modelo soma ao prompt uma dica de composição (espaço livre pra texto etc.) — `TEMPLATES` em `hub/backend/media.py`
  - Limite honesto: **o gerador não escreve texto bem**; o texto do post entra depois (Canva etc.)
  - No notebook de 4 GB: ~1 min nos tamanhos rápidos, ~2–3 min nos de 1080+, vários minutos em 2048²
  - [ ] Salvar modelos próprios da VZ (identidade visual: cores, estilo) como padrões da equipe
- [x] **Notebook dormia mesmo com "nunca suspender"** (14/10): o Dell usa *Modern Standby* (S0, Wi-Fi conectado) e entra em espera por "Idle Timeout" (08:47, 09:06 — voltou só ao mexer no mouse/teclado), parando tudo. Ajustado no plano de energia: suspensão autônoma 120 s → nunca, "permitir estados de espera" → desligado, tela não apaga ao travar. **Ainda não confirmado na prática.** Se voltar a dormir: desligar o Modern Standby no registro (`HKLM\SYSTEM\CurrentControlSet\Control\Power\PlatformAoAcOverride = 0`, precisa de administrador + reinício)
- [ ] Início dos serviços sem precisar de login no Windows (hoje sobem no logon; Gabriel preferiu manter o login por enquanto) e "horas ativas" do Windows Update

(Notas de rede e governança do servidor: mantidas em arquivo privado, fora deste repositório.)
### Tarefas (14/10)
- [x] **Tarefas pessoais**: aba Tarefas (filtros abertas/hoje/atrasadas/concluídas, prazo, status, editar/excluir), cartão na Home com criação rápida ("Hoje"), e **ideia → tarefa** (botão "Virar tarefa" na aba Ideias; uma ideia só vira tarefa uma vez). Cada usuário vê só as próprias. API: `/api/tasks`

### Backlog pedido pelo Gabriel (14/10) — a priorizar
- [ ] **Equipe**: atribuir tarefas a funcionários, carga por pessoa, suspender/reativar acesso
- [ ] **Projetos/Git**: conexão com os repositórios (commits, PRs, issues, atividade por pessoa)
- [ ] **Foto real da internet** (não gerada por IA) como fundo da Home, com crédito/licença (Wikimedia Commons / Pexels / Unsplash)
- [ ] **Redes sociais da VZ**: calendário de conteúdo, rascunhos, legendas e imagens; publicar só com aprovação explícita
- [ ] **Agente de programação próprio** (substituir o Cline) usando o Ayran Code
- [ ] **Logs/auditoria de todos na plataforma** (somente admin; avisar a equipe — LGPD)
- [ ] **IA que aprende sempre**: memória de longo prazo, RAG dos projetos, 👍/👎 como dataset; LoRA/destilação quando houver GPU de 24 GB
- [x] **Voz no chat** (14/10): ditar mensagem (microfone), modo conversa (ouve → responde falando → ouve de novo) e ler respostas em voz alta; usa o navegador (pt-BR). O reconhecimento de fala do Chrome/Edge passa pela nuvem do navegador. [x] Voz 100% local (14/10): Whisper "small" (ouvir) + Piper (falar, 3 vozes pt-BR com seletor) no servidor, em CPU, endpoints `/api/voice/*`, fallback no navegador. [ ] Clonar voz (XTTS/F5, só com autorização de quem for clonado), wake word, interromper falando
- [ ] **Vida toda (life-OS)**: agenda e compromissos, tendências, notificações, **falar com a IA para criar tarefas/ideias/compromissos** (tool calling)
- [ ] **App no celular** (PWA com notificações push) e **integração com o carro** (central multimídia, quando comprar)
- [ ] **Saúde**: integração com smartwatch (Health Connect / Apple Health), dados só locais
- [ ] **Bancos e investimentos**: leitura apenas (Open Finance/agregador), credenciais nunca no chat/repositório; sugestões de investimento só informativas, sem recomendação regulada
- [ ] **Pesquisa de integrações úteis** para a vida e para a empresa (a entregar)

## Fila de desenvolvimento (definida em 15/10) — ordem de execução
Visão: o Ayran como **IA de empresa**, escalável e personalizada por cliente, rodando em várias empresas.

1. [ ] **Auditoria e controle de equipe** (antes de qualquer conector, pois mais gente já tem acesso): logs de todos na plataforma (somente admin; avisar a equipe — LGPD), suspender/reativar acesso, atribuir tarefas a funcionários, carga por pessoa, dados separados por pessoa
2. [ ] **Framework de conectores** (padrão **MCP**; n8n para o que não tiver conector), com permissão por pessoa e auditoria
3. [ ] **E-mail** (piloto dos conectores): Gmail/Google Workspace e Outlook/Microsoft 365 via **OAuth**; começa só leitura (resumo, tarefas, compromissos) → rascunhos aprovados → envio só com confirmação; tokens criptografados no servidor, cada pessoa conecta o seu
4. [ ] **Verificador de golpes de e-mail**: tela onde se cola o e-mail ou envia `.eml`; checagens técnicas (SPF/DKIM/DMARC, remetente e Reply-To, domínio parecido/recente, link ≠ texto, anexos de risco) + leitura do modelo (urgência, pedido de dinheiro/senha, golpe do CEO/fornecedor, boleto/PIX falso, falsa Receita/NF-e/banco); veredito + motivos + o que fazer. Nunca abre link/anexo sozinho; reputação de links (Safe Browsing/VirusTotal) opcional e desligada por padrão. Depois: análise automática da caixa conectada e relatório de tentativas para empresas
5. [ ] **Agenda e compromissos**, e **criar tarefas/ideias/compromissos falando com a IA** (tool calling)
6. [ ] **Perfil de empresa (tenant)**: marca, persona, módulos, conectores, base de conhecimento e modelos vindos de configuração, não do código; **SSO** (Entra ID, Google, Okta)
7. [ ] **RAG por empresa** (base de conhecimento) e **IA que aprende** (memória longa, 👍/👎 como dataset)
8. [ ] **Empacotamento (Docker)** para instalar uma instância isolada por cliente com um comando; depois cobrança por uso e canal de atualização
9. [ ] Git/Projetos, foto real no fundo da Home, redes sociais da VZ, agente de programação próprio (substituir o Cline)
10. [ ] App no celular (PWA + notificações), integração com o carro e smartwatch/saúde, bancos/Open Finance e sugestões de investimento (informativas)

11. [ ] **Inteligência de negócio** (visão de empresa, 15/10): com os sistemas conectados, o Ayran cruza os dados e dá dicas e pontos de atenção, identifica padrões (vendas, suporte, financeiro), apoia departamentos (vendas, financeiro, atendimento, RH, TI) e estratégia, com resumo diário e alertas por pessoa/departamento; melhora com o uso via memória longa, RAG e feedback (👍/👎) — o modelo não se altera sozinho; começar por 1 área e 1–2 sistemas (ex.: vendas com CRM e e-mail) e medir a utilidade dos avisos

12. [ ] **Dois temas visuais** (15/10): o atual (escuro, cenas do clima) e um segundo a partir de referências que o Gabriel vai enviar; mesmos dados e funções, só muda a camada visual (tokens de cor/fonte/fundo trocáveis), seletor no app; depois tema por cliente (logo, cores)
13. [ ] **Mercado-alvo**: do pequeno comércio (lojistas, lojas físicas, oficinas mecânicas, prestadores) à média empresa; voz, linguagem simples, WhatsApp e celular; segurança como diferencial. Em aberto: pequeno comércio hospedado e gerenciado pela VZ vs instalação local

Integrações-alvo por área: Microsoft 365 e Google Workspace; Slack, Teams, WhatsApp Business API; ERP (TOTVS, SAP, Senior, Sankhya, NetSuite, Omie, Bling, Conta Azul); CRM (Salesforce, HubSpot, Pipedrive, RD Station); Jira/GitHub/GitLab/Azure DevOps/Notion; Zendesk/Freshdesk/Movidesk; Power BI/Metabase/BigQuery e bancos SQL; NF-e (Focus NFe, eNotas); RH (Gupy, Convenia, Pontomais).
Modelo de entrega: **uma instalação isolada por cliente** (começar assim); SaaS multi-tenant só depois. Para escalar: GPU de 24 GB+ ou híbrido (dados na empresa, modelo grande via API quando o cliente autorizar).

### Protótipo como vitrine (15/10)
- [x] Tela **Recursos**: catálogo com 6 recursos ativos, 15 em **prévia** (telas de demonstração com dados de exemplo, sempre marcadas) e 4 planejados; filtro por área (Pessoal, Empresa, Pequeno comércio). Prévias: e-mail inteligente, verificador de golpes, agenda, comandos por voz, inteligência de negócio, integrações, redes sociais, Git, auditoria, modo oficina, modo loja, saúde/relógio, bancos/investimentos, carro, app no celular — `hub/frontend/src/components/demos.tsx`, `Showcase.tsx`
- [x] **Música (Spotify) retirada do app por enquanto** (pedido do Gabriel); `Music.tsx` e `Player.tsx` ficam no repositório, sem uso, para voltar depois
- Regra: toda demonstração deve dizer que usa dados de exemplo; quando uma função virar real, sai de `demos.tsx` e ganha tela própria

### Protótipo integrado e duas interfaces (15/10)
- [x] **E-mail integrado** (caixa de exemplo + **analisador de golpes real** `scam.py`: SPF/DKIM/DMARC, remetente×resposta, domínio parecido, link×texto, anexos, linguagem) e tela "Analisar um e-mail" (cole o texto)
- [x] **Agenda real** (compromissos por usuário, conflitos, "mover para depois"); **Negócio** (indicadores de exemplo + sinais reais de tarefas/e-mail/agenda); **Resumo do dia** para o diretor com leitura em voz; **Central de notificações** (sino + aviso flutuante); **voz na Home**; e-mail novo "chega" na demonstração
- [x] Home sem infraestrutura (servidor/serviços/conversas saíram); no lugar, indicadores, projetos e equipe da empresa (exemplo)
- [x] **Fotos reais de clima** (Wikimedia Commons, com crédito de autor e licença) no lugar das imagens geradas por IA; vista da cidade por IA desligada (`USE_AI_CITY_VIEW`); `server/fetch-scene-photos.py` refaz a busca
- [x] **Duas interfaces independentes** (estrutura própria, não só cor): **Ayran** (escura, imersiva) e **Lia** (clara, painel em blocos, dock, Ctrl+K), com seletor; registro em `skins/` para criar modelos novos e, depois, um por cliente
- [ ] **Lia: seguir a referência visual do Gabriel** (a imagem enviada em 15/10 era a tela escura atual, não a clara; aguardando a referência da interface clara)
- [ ] Guardar a interface escolhida por usuário no servidor e permitir **padrão por empresa**
- [x] Documentação UML em [docs/UML.md](docs/UML.md)

### Identidade da empresa e cenário para apresentação (15/10)
- [x] **Imagem principal = escritório de desenvolvimento** (foto real, Bridge Global, CC BY-SA 4.0) como padrão nas duas interfaces; o clima virou opção. Troca a qualquer momento: "Padrão / Clima / Escritório / Minha imagem / cenas de clima" (Ayran: botões no topo; Lia: seletor "Imagem")
- [x] **Identidade da empresa** (Equipe → Identidade da empresa, só administrador): nome, site, **logo** e **imagem principal própria** (JPG/PNG/WebP, validadas e redimensionadas); aparecem nas duas interfaces. API: `/api/brand` (GET público; alterar só admin). O logo da VZ ainda precisa ser enviado: o site não é acessível daqui (inspeção de certificado da rede da empresa)
- [x] **Modo apresentação** (seletor de interface): tela limpa e repetível para prints (sem e-mail chegando sozinho, sem aviso flutuante, sem etiquetas "Exemplo"; selo fixo "Demonstração com dados fictícios") e **Restaurar dados de exemplo** (`/api/demo/reset`; mantém o que foi criado de verdade; se não houver tarefas, entram tarefas de exemplo). URL direta: `?apresentacao=1`
- [ ] Trocar a foto do escritório por uma imagem profissional da VZ (enviar pela tela de identidade) ou de banco de imagens licenciado
