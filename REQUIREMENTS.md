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
