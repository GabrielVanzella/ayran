import { useState } from 'react'
import {
  AlertTriangle,
  BellRing,
  BrainCircuit,
  Building2,
  CalendarDays,
  Car,
  Check,
  Code2,
  GitBranch,
  HeartPulse,
  KeyRound,
  Landmark,
  ListTodo,
  Mail,
  MessageSquare,
  Mic,
  Newspaper,
  Palette,
  Plug,
  ScrollText,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Store,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react'
import type { Tab } from '../App'

// Telas de demonstração: tudo aqui usa DADOS DE EXEMPLO. Nada é lido de contas reais.

export type Status = 'ativo' | 'previa' | 'planejado'
export type Area = 'Pessoal' | 'Empresa' | 'Pequeno comércio'

export type Feature = {
  id: string
  title: string
  area: Area
  status: Status
  icon: typeof Mail
  summary: string
  tab?: Tab // recurso ativo: abre a tela real
  details?: string[] // o que fará (planejado)
  Demo?: () => React.JSX.Element
}

const Panel = ({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) => (
  <div className={`rounded-3xl border border-white/10 bg-white/[0.04] p-4 ${className}`}>
    {title && <h3 className="mb-3 text-sm font-medium text-dim">{title}</h3>}
    {children}
  </div>
)

const Chip = ({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: React.ReactNode }) => {
  const c = {
    ok: 'bg-emerald-400/15 text-emerald-200',
    warn: 'bg-amber-400/15 text-amber-200',
    bad: 'bg-red-500/15 text-red-300',
    info: 'bg-white/10 text-ink',
  }[tone]
  return <span className={`inline-block shrink-0 rounded-full px-2.5 py-0.5 text-[11px] ${c}`}>{children}</span>
}

const Bar = ({ value, max = 100, label }: { value: number; max?: number; label?: string }) => (
  <div className="flex items-center gap-3">
    {label && <span className="w-24 shrink-0 truncate text-xs text-dim">{label}</span>}
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-white/70" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-dim">{value}</span>
  </div>
)

// ---------- e-mail inteligente + verificador de golpes ----------

const MAILS = [
  {
    from: 'Banco Seguro <suporte@bancoseguro-atualiza.com>',
    subject: 'Sua conta será bloqueada em 24h',
    verdict: 'bad' as const,
    label: 'Provável golpe',
    reasons: [
      'O domínio "bancoseguro-atualiza.com" foi criado há 3 dias e não é o do banco',
      'Falha na verificação SPF e DKIM: o remetente não é quem diz ser',
      'O link mostra "bancoseguro.com.br", mas leva a outro endereço',
      'Urgência e ameaça de bloqueio para você agir sem pensar',
    ],
    action: 'Não clique. Se tiver dúvida, ligue para o número oficial do banco.',
  },
  {
    from: 'Marina Souza <marina@clienteabc.com.br>',
    subject: 'Aprovação da proposta e próximos passos',
    verdict: 'ok' as const,
    label: 'Seguro',
    reasons: ['Remetente conhecido, já trocou 14 e-mails com você', 'SPF, DKIM e DMARC aprovados', 'Sem links nem anexos suspeitos'],
    action: 'O Ayran sugeriu uma tarefa: "Enviar contrato revisado até sexta".',
  },
  {
    from: 'Financeiro <financeiro@fornecedorxyz.net>',
    subject: 'Mudamos nossa conta bancária — pague este boleto',
    verdict: 'warn' as const,
    label: 'Suspeito',
    reasons: [
      'Pedido para pagar em uma conta nova (padrão comum do golpe do fornecedor)',
      'O Responder-para é diferente do remetente',
      'Primeira vez que esse endereço escreve para você',
    ],
    action: 'Confirme por telefone com o fornecedor antes de pagar.',
  },
  {
    from: 'Receita Federal <contato@receita-regularize.org>',
    subject: 'Pendência no seu CPF — regularize agora',
    verdict: 'bad' as const,
    label: 'Provável golpe',
    reasons: ['A Receita Federal não envia e-mail cobrando regularização', 'Domínio ".org" imitando órgão do governo', 'Anexo .zip com senha'],
    action: 'Apague e não abra o anexo.',
  },
]

export function DemoEmail() {
  const [sel, setSel] = useState(0)
  const m = MAILS[sel]
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <Panel title="Caixa de entrada" className="lg:col-span-2">
        <ul className="space-y-1">
          {MAILS.map((x, i) => (
            <li key={x.subject}>
              <button
                onClick={() => setSel(i)}
                aria-current={sel === i}
                className={`w-full rounded-2xl px-3 py-2.5 text-left transition ${sel === i ? 'bg-white/10' : 'hover:bg-white/5'}`}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{x.subject}</span>
                  <Chip tone={x.verdict}>{x.label}</Chip>
                </div>
                <p className="truncate text-xs text-dim">{x.from}</p>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="lg:col-span-3">
        <div className="mb-3 flex items-center gap-3">
          {m.verdict === 'ok' ? <ShieldCheck className="size-7 text-emerald-300" /> : <ShieldAlert className={`size-7 ${m.verdict === 'bad' ? 'text-red-300' : 'text-amber-300'}`} />}
          <div className="min-w-0">
            <p className="truncate font-medium">{m.subject}</p>
            <p className="truncate text-xs text-dim">{m.from}</p>
          </div>
        </div>
        <p className="mb-2 text-sm text-dim">Por que o Ayran chegou a essa conclusão</p>
        <ul className="mb-4 space-y-1.5 text-sm">
          {m.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-white/60" /> {r}
            </li>
          ))}
        </ul>
        <p className="rounded-2xl bg-white/[0.06] px-4 py-3 text-sm">{m.action}</p>
      </Panel>
    </div>
  )
}

export function DemoScam() {
  const [done, setDone] = useState(false)
  const checks: [string, 'ok' | 'bad' | 'warn', string][] = [
    ['SPF / DKIM / DMARC', 'bad', 'Reprovado'],
    ['Idade do domínio', 'bad', '3 dias'],
    ['Remetente × Responder-para', 'warn', 'Diferentes'],
    ['Link × texto exibido', 'bad', 'Endereços diferentes'],
    ['Anexo', 'ok', 'Nenhum'],
    ['Linguagem (urgência, ameaça, pedido de dados)', 'bad', 'Alta'],
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Cole o e-mail ou envie o arquivo .eml">
        <textarea
          readOnly
          className="h-56 w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-3 text-sm outline-none"
          defaultValue={'De: Banco Seguro <suporte@bancoseguro-atualiza.com>\nAssunto: Sua conta será bloqueada em 24h\n\nPrezado cliente, detectamos acesso suspeito. Para evitar o bloqueio, confirme seus dados agora no link abaixo:\nhttp://bancoseguro.com.br/confirmar'}
        />
        <button onClick={() => setDone(true)} className="mt-3 rounded-full bg-white px-5 py-2 text-sm font-medium text-void hover:bg-white/90">
          Analisar
        </button>
      </Panel>
      <Panel title="Resultado">
        {!done ? (
          <p className="py-16 text-center text-sm text-dim">Toque em Analisar para ver um exemplo do relatório.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3">
              <ShieldAlert className="size-8 text-red-300" />
              <div>
                <p className="font-medium">Provável golpe</p>
                <p className="text-xs text-dim">Risco 94 de 100 (exemplo)</p>
              </div>
            </div>
            <ul className="space-y-2">
              {checks.map(([k, tone, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{k}</span>
                  <Chip tone={tone}>{v}</Chip>
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-2xl bg-white/[0.06] px-4 py-3 text-sm">Não clique no link. Se quiser confirmar, ligue para o banco pelo número do cartão.</p>
          </>
        )}
      </Panel>
    </div>
  )
}

// ---------- agenda ----------

export function DemoAgenda() {
  const ev = [
    ['09:00', 'Daily com a equipe', 'Teams', false],
    ['10:30', 'Reunião com Cliente ABC — proposta', 'Google Meet', true],
    ['12:00', 'Almoço', '', false],
    ['14:00', 'Revisar contrato do cliente', 'Tarefa', false],
    ['14:30', 'Ligação com fornecedor', 'Telefone', true],
    ['17:00', 'Fechamento da semana', '', false],
  ] as const
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Hoje" className="lg:col-span-2">
        <ul className="space-y-1">
          {ev.map(([h, t, w, c]) => (
            <li key={h} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-white/5">
              <span className="w-12 shrink-0 text-sm tabular-nums text-dim">{h}</span>
              <span className="h-8 w-1 shrink-0 rounded-full bg-white/40" />
              <span className="min-w-0 flex-1 truncate text-sm">{t}</span>
              {w && <span className="hidden text-xs text-dim sm:inline">{w}</span>}
              {c && <Chip tone="info">Preparar pauta</Chip>}
            </li>
          ))}
        </ul>
      </Panel>
      <div className="space-y-4">
        <Panel title="O Ayran avisou">
          <p className="flex gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-300" /> Conflito: a ligação das 14:30 cobre o fim da revisão do contrato.</p>
          <p className="mt-3 rounded-2xl bg-white/[0.06] px-3 py-2 text-sm">Sugestão: mover a revisão para 15:00. Confirma?</p>
        </Panel>
        <Panel title="Peça falando">
          <p className="flex gap-2 text-sm text-dim"><Mic className="mt-0.5 size-4 shrink-0" /> “Marca reunião com a Marina na quinta às 15h e me lembra uma hora antes.”</p>
        </Panel>
      </div>
    </div>
  )
}

// ---------- inteligência de negócio ----------

export function DemoInsights() {
  const weeks = [38, 44, 41, 72]
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Pontos de atenção" className="lg:col-span-2">
        <ul className="space-y-3">
          {[
            ['bad', 'Propostas paradas', '3 propostas grandes sem resposta há mais de 14 dias (R$ 84 mil no total).'],
            ['warn', 'Contrato vence em 30 dias', 'Cliente ABC — renovação ainda sem conversa registrada.'],
            ['info', 'Padrão detectado', 'As vendas concentram 58% do mês na última semana. Há espaço para antecipar campanhas.'],
            ['warn', 'Suporte', 'Chamados sobre “login” cresceram 3x depois da atualização de terça.'],
          ].map(([t, h, b]) => (
            <li key={h} className="flex gap-3">
              <Chip tone={t as 'bad' | 'warn' | 'info'}>{t === 'bad' ? 'Urgente' : t === 'warn' ? 'Atenção' : 'Insight'}</Chip>
              <div className="min-w-0">
                <p className="text-sm font-medium">{h}</p>
                <p className="text-sm text-dim">{b}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <div className="space-y-4">
        <Panel title="Vendas por semana do mês (R$ mil)">
          <div className="space-y-2">{weeks.map((v, i) => <Bar key={i} label={`Semana ${i + 1}`} value={v} max={80} />)}</div>
        </Panel>
        <Panel title="Resumo para a diretoria">
          <p className="text-sm text-dim">Receita 12% acima do mês anterior; maior risco: dependência de 2 clientes (61% da receita).</p>
        </Panel>
      </div>
    </div>
  )
}

// ---------- integrações ----------

const INTEGRATIONS: Record<string, string[]> = {
  'E-mail e agenda': ['Microsoft 365 (Outlook)', 'Google Workspace (Gmail)'],
  Comunicação: ['Slack', 'Microsoft Teams', 'WhatsApp Business', 'Telegram'],
  'ERP e financeiro': ['TOTVS', 'SAP', 'Senior', 'Sankhya', 'NetSuite', 'Omie', 'Bling', 'Conta Azul'],
  'CRM e vendas': ['Salesforce', 'HubSpot', 'Pipedrive', 'RD Station'],
  'Projetos e código': ['GitHub', 'GitLab', 'Jira', 'Azure DevOps', 'Notion', 'Trello'],
  Atendimento: ['Zendesk', 'Freshdesk', 'Movidesk'],
  'Dados e BI': ['Power BI', 'Metabase', 'BigQuery', 'PostgreSQL', 'SQL Server'],
  'Notas e pagamentos': ['Focus NFe', 'eNotas', 'Asaas', 'Stripe', 'Mercado Pago'],
}

export function DemoIntegrations() {
  const [q, setQ] = useState('')
  return (
    <div className="space-y-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar sistema…"
        aria-label="Buscar sistema"
        className="w-full max-w-md rounded-full border border-white/15 bg-white/[0.05] px-4 py-2 text-sm outline-none placeholder:text-dim focus:border-white/40"
      />
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(INTEGRATIONS).map(([cat, items]) => {
          const shown = items.filter((i) => i.toLowerCase().includes(q.toLowerCase()))
          if (!shown.length) return null
          return (
            <Panel key={cat} title={cat}>
              <div className="flex flex-wrap gap-2">
                {shown.map((i) => (
                  <button key={i} disabled className="flex items-center gap-2 rounded-full border border-white/15 px-3 py-1.5 text-sm text-dim">
                    <Plug className="size-3.5" /> {i} <span className="text-[10px] uppercase tracking-wide">em breve</span>
                  </button>
                ))}
              </div>
            </Panel>
          )
        })}
      </div>
    </div>
  )
}

// ---------- redes sociais ----------

export function DemoSocial() {
  const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  const posts: Record<string, string> = { Seg: 'Dica de tecnologia', Qua: 'Caso de cliente', Sex: 'Bastidores da equipe' }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Calendário da semana (rascunhos)" className="lg:col-span-2">
        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => (
            <div key={d} className="min-h-28 rounded-2xl border border-white/10 p-2">
              <p className="text-xs text-dim">{d}</p>
              {posts[d] && (
                <div className="mt-2 rounded-xl bg-white/10 p-2 text-[11px] leading-snug">
                  {posts[d]}
                  <span className="mt-1 block text-dim">Instagram · aguardando aprovação</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Legenda sugerida pelo Ayran">
        <p className="text-sm">Automatizar não é trocar pessoas, é dar tempo para elas pensarem. Conheça como a VZ ajuda a sua empresa a ganhar horas por semana. 🚀</p>
        <p className="mt-3 text-xs text-dim">#tecnologia #automação #empresas</p>
        <div className="mt-4 flex gap-2">
          <button disabled className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-void opacity-80">Aprovar e agendar</button>
          <button disabled className="rounded-full border border-white/20 px-4 py-1.5 text-xs">Gerar imagem</button>
        </div>
        <p className="mt-3 text-xs text-dim">Nada é publicado sem a sua aprovação.</p>
      </Panel>
    </div>
  )
}

// ---------- projetos e git ----------

export function DemoGit() {
  const repos = [
    ['ayran', 'Tarefas: aba, cartão na Home e ideia vira tarefa', '2 PRs abertos', 'há 1 h'],
    ['site-vz', 'Ajusta formulário de contato', '0 PRs', 'há 2 dias'],
    ['app-cliente-abc', 'Corrige cálculo de frete', '1 PR aberto', 'ontem'],
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Projetos" className="lg:col-span-2">
        <ul className="divide-y divide-white/10">
          {repos.map(([n, c, p, t]) => (
            <li key={n} className="flex items-center gap-3 py-3">
              <GitBranch className="size-4 shrink-0 text-dim" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n}</p>
                <p className="truncate text-xs text-dim">{c}</p>
              </div>
              <span className="hidden text-xs text-dim sm:inline">{p}</span>
              <span className="text-xs text-dim">{t}</span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Atividade da semana por pessoa">
        <div className="space-y-2">
          <Bar label="Gabriel" value={34} max={40} />
          <Bar label="Douglas" value={21} max={40} />
          <Bar label="Marcos" value={9} max={40} />
        </div>
        <p className="mt-4 text-sm text-dim">Resumo do Ayran: o <strong className="text-ink">app-cliente-abc</strong> tem 1 PR parado há 3 dias.</p>
      </Panel>
    </div>
  )
}

// ---------- auditoria ----------

export function DemoAudit() {
  const [who, setWho] = useState('Todos')
  const rows = [
    ['14:02', 'Douglas', 'Login', 'Central'],
    ['14:05', 'Douglas', 'Gerou imagem', 'Post Instagram 1080²'],
    ['14:11', 'Gabriel', 'Criou tarefa', 'Revisar contrato'],
    ['14:20', 'Marcos', 'Conversa com a IA', 'Chat (assunto não exibido)'],
    ['14:33', 'Gabriel', 'Suspendeu acesso', 'Conta de teste'],
    ['14:40', 'Douglas', 'Conectou e-mail', 'Microsoft 365 (leitura)'],
  ]
  const list = who === 'Todos' ? rows : rows.filter((r) => r[1] === who)
  return (
    <Panel title="Atividade na plataforma (somente administrador)">
      <div className="mb-3 flex flex-wrap gap-2">
        {['Todos', 'Gabriel', 'Douglas', 'Marcos'].map((p) => (
          <button key={p} onClick={() => setWho(p)} aria-pressed={who === p} className={`rounded-full px-3 py-1 text-xs ${who === p ? 'bg-white text-void' : 'border border-white/20 text-dim'}`}>
            {p}
          </button>
        ))}
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-dim">
          <tr><th className="pb-2 font-normal">Hora</th><th className="pb-2 font-normal">Pessoa</th><th className="pb-2 font-normal">Ação</th><th className="pb-2 font-normal">Onde</th></tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {list.map((r) => (
            <tr key={r.join()}>{r.map((c, i) => <td key={i} className="py-2 pr-3">{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-dim">O conteúdo das conversas não aparece por padrão. A equipe é avisada de que a atividade é registrada (LGPD).</p>
    </Panel>
  )
}

// ---------- comandos por voz ----------

export function DemoVoiceCommands() {
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-white/10 px-4 py-3 text-sm">“Cria uma tarefa para revisar o contrato do cliente amanhã e me lembra às 9h.”</div>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">
        <p>Pronto! Criei a tarefa e o lembrete.</p>
        <div className="mt-3 flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2">
          <ListTodo className="size-4 shrink-0 text-dim" />
          <span className="min-w-0 flex-1 truncate">Revisar contrato do cliente</span>
          <Chip tone="info">amanhã</Chip>
        </div>
      </div>
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-md bg-white/10 px-4 py-3 text-sm">“Anota uma ideia: oferecer o Ayran para oficinas.”</div>
      <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.04] px-4 py-3 text-sm">Ideia salva em Ideias. Quer que eu a transforme em tarefa?</div>
    </div>
  )
}

// ---------- vida pessoal ----------

export function DemoHealth() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[
        ['Sono', '7 h 20', 'Acima da sua média'],
        ['Passos', '6.840', 'Meta: 8.000'],
        ['Frequência em repouso', '62 bpm', 'Estável'],
      ].map(([k, v, s]) => (
        <Panel key={k} title={k}>
          <p className="text-3xl font-semibold">{v}</p>
          <p className="mt-1 text-sm text-dim">{s}</p>
        </Panel>
      ))}
      <Panel title="Dica do Ayran" className="md:col-span-3">
        <p className="text-sm">Você dormiu bem, mas passou 6 horas sentado ontem. Que tal uma caminhada de 15 minutos depois do almoço? Seus dados de saúde ficam só no seu servidor.</p>
      </Panel>
    </div>
  )
}

export function DemoBank() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Saldo consolidado (somente leitura)">
        <p className="text-3xl font-semibold">R$ 18.420,00</p>
        <p className="mt-1 text-sm text-dim">3 contas conectadas por Open Finance</p>
      </Panel>
      <Panel title="Gastos do mês por categoria" className="lg:col-span-2">
        <div className="space-y-2">
          <Bar label="Moradia" value={2800} max={3000} />
          <Bar label="Alimentação" value={1450} max={3000} />
          <Bar label="Assinaturas" value={420} max={3000} />
          <Bar label="Transporte" value={780} max={3000} />
        </div>
      </Panel>
      <Panel title="Ideia de investimento (informativa)" className="lg:col-span-3">
        <p className="text-sm">Você mantém R$ 9 mil parados na conta corrente. Uma reserva de emergência em renda fixa com liquidez diária poderia render mais do que a conta. Compare as opções do seu banco antes de decidir.</p>
        <p className="mt-2 text-xs text-dim">Conteúdo informativo, não é recomendação de investimento. Consulte um profissional habilitado.</p>
      </Panel>
    </div>
  )
}

export function DemoCar() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Na central multimídia">
        <ul className="space-y-3 text-sm">
          <li className="flex gap-2"><Mic className="mt-0.5 size-4 shrink-0 text-dim" /> “Ayran, o que tenho de compromisso hoje?”</li>
          <li className="rounded-2xl bg-white/[0.06] px-3 py-2">Você tem a reunião com o Cliente ABC às 10h30. Saindo agora, chega em 18 minutos.</li>
          <li className="flex gap-2"><Mic className="mt-0.5 size-4 shrink-0 text-dim" /> “Cria uma tarefa: ligar para o fornecedor.”</li>
        </ul>
      </Panel>
      <Panel title="Lembretes do carro">
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between"><span>Revisão dos 30 mil km</span><Chip tone="warn">em 800 km</Chip></li>
          <li className="flex items-center justify-between"><span>IPVA</span><Chip tone="ok">pago</Chip></li>
          <li className="flex items-center justify-between"><span>Troca de óleo</span><Chip tone="info">em 2 meses</Chip></li>
        </ul>
      </Panel>
    </div>
  )
}

export function DemoMobile() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Notificações no celular">
        <ul className="space-y-2">
          {[
            ['Tarefa vence hoje', 'Revisar contrato do cliente'],
            ['E-mail suspeito bloqueado', 'Banco Seguro — provável golpe'],
            ['Reunião em 30 minutos', 'Cliente ABC — proposta'],
          ].map(([a, b]) => (
            <li key={a} className="flex items-start gap-3 rounded-2xl bg-white/[0.06] px-3 py-2.5">
              <BellRing className="mt-0.5 size-4 shrink-0 text-dim" />
              <div className="min-w-0"><p className="text-sm font-medium">{a}</p><p className="truncate text-xs text-dim">{b}</p></div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Como instalar">
        <p className="text-sm text-dim">O Ayran vira um app na tela inicial do celular (PWA), sem loja de aplicativos, com avisos, voz e câmera para enviar fotos e documentos ao Ayran.</p>
      </Panel>
    </div>
  )
}

// ---------- pequeno comércio ----------

export function DemoWorkshop() {
  const cols: [string, string[]][] = [
    ['Aguardando', ['Gol 2014 — revisão 60 mil km', 'Onix — barulho na suspensão']],
    ['Em serviço', ['HB20 — troca de pastilhas', 'Strada — alinhamento e balanceamento']],
    ['Pronto para retirar', ['Civic — troca de óleo e filtros']],
  ]
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {cols.map(([t, items]) => (
          <Panel key={t} title={t}>
            <ul className="space-y-2">
              {items.map((i) => <li key={i} className="rounded-2xl bg-white/[0.06] px-3 py-2 text-sm">{i}</li>)}
            </ul>
          </Panel>
        ))}
      </div>
      <Panel title="O Ayran cuida do relacionamento">
        <ul className="space-y-1.5 text-sm">
          <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-dim" /> Avisa 12 clientes cuja revisão vence neste mês, com mensagem pronta para o WhatsApp.</li>
          <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-dim" /> Monta o orçamento do HB20 e explica o serviço em linguagem simples para o cliente.</li>
          <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-dim" /> O mecânico dita a ordem de serviço falando, com as mãos sujas.</li>
        </ul>
      </Panel>
    </div>
  )
}

export function DemoStore() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title="Vendas de hoje">
        <p className="text-3xl font-semibold">R$ 2.350</p>
        <p className="mt-1 text-sm text-dim">38 vendas · ticket médio R$ 61,84 · 8% acima de ontem</p>
      </Panel>
      <Panel title="Estoque baixo" className="lg:col-span-2">
        <div className="space-y-2">
          <Bar label="Camiseta M" value={3} max={20} />
          <Bar label="Calça jeans 40" value={2} max={20} />
          <Bar label="Boné preto" value={4} max={20} />
        </div>
        <p className="mt-3 text-sm text-dim">Sugestão: repor 30 camisetas; elas respondem por 22% das vendas da semana.</p>
      </Panel>
      <Panel title="Promoção pronta para o Instagram" className="lg:col-span-3">
        <p className="text-sm">“Fim de semana de ofertas! Leve 2 camisetas e ganhe 15% de desconto.” O Ayran já gerou a imagem 1080×1080 e a legenda; falta só você aprovar.</p>
      </Panel>
    </div>
  )
}

// ---------- catálogo ----------

export const FEATURES: Feature[] = [
  { id: 'chat', title: 'Chat inteligente', area: 'Pessoal', status: 'ativo', icon: MessageSquare, tab: 'chat', summary: 'Conversa, raciocínio e código; o Ayran escolhe o especialista certo.' },
  { id: 'voz', title: 'Conversa por voz', area: 'Pessoal', status: 'ativo', icon: Mic, tab: 'chat', summary: 'Fale e ouça a resposta, com voz local no servidor.' },
  { id: 'criar', title: 'Criar imagens', area: 'Empresa', status: 'ativo', icon: Palette, tab: 'create', summary: 'Posts, stories e banners nos tamanhos certos, a partir de texto ou de uma imagem.' },
  { id: 'tarefas', title: 'Tarefas e ideias', area: 'Pessoal', status: 'ativo', icon: ListTodo, tab: 'tasks', summary: 'Organize o dia e transforme ideias em tarefas.' },
  { id: 'noticias', title: 'Notícias', area: 'Pessoal', status: 'ativo', icon: Newspaper, tab: 'news', summary: 'Manchetes dos temas que importam para você.' },
  { id: 'equipe', title: 'Equipe e acesso', area: 'Empresa', status: 'ativo', icon: Users, tab: 'team', summary: 'Contas por pessoa, papéis e troca de senha.' },

  { id: 'email', title: 'E-mail inteligente', area: 'Empresa', status: 'previa', icon: Mail, summary: 'Resume a caixa de entrada, extrai tarefas e identifica e-mails perigosos.', Demo: DemoEmail },
  { id: 'golpes', title: 'Verificador de golpes', area: 'Empresa', status: 'previa', icon: ShieldAlert, summary: 'Diz se um e-mail parece golpe e explica o porquê.', Demo: DemoScam },
  { id: 'agenda', title: 'Agenda e compromissos', area: 'Pessoal', status: 'previa', icon: CalendarDays, summary: 'Seu dia em um só lugar, com avisos de conflito.', Demo: DemoAgenda },
  { id: 'comandos', title: 'Comandos por voz', area: 'Pessoal', status: 'previa', icon: Mic, summary: 'Peça falando: criar tarefas, ideias e compromissos.', Demo: DemoVoiceCommands },
  { id: 'insights', title: 'Inteligência de negócio', area: 'Empresa', status: 'previa', icon: TrendingUp, summary: 'Cruza os sistemas, aponta padrões e pontos de atenção por departamento.', Demo: DemoInsights },
  { id: 'integracoes', title: 'Integrações', area: 'Empresa', status: 'previa', icon: Plug, summary: 'Microsoft 365, Google, ERPs, CRMs e outros sistemas da empresa.', Demo: DemoIntegrations },
  { id: 'social', title: 'Redes sociais', area: 'Empresa', status: 'previa', icon: Share2, summary: 'Calendário de posts, legendas e imagens, com aprovação antes de publicar.', Demo: DemoSocial },
  { id: 'git', title: 'Projetos e Git', area: 'Empresa', status: 'ativo', icon: GitBranch, tab: 'projects', summary: 'Conecte o GitHub ou uma pasta Git e acompanhe commits, PRs e a atividade de cada pessoa.' },
  { id: 'auditoria', title: 'Auditoria e logs', area: 'Empresa', status: 'previa', icon: ScrollText, summary: 'Quem fez o quê na plataforma, visível só ao administrador.', Demo: DemoAudit },
  { id: 'oficina', title: 'Modo oficina', area: 'Pequeno comércio', status: 'previa', icon: Wrench, summary: 'Ordens de serviço, orçamentos e lembretes de revisão para mecânicas.', Demo: DemoWorkshop },
  { id: 'loja', title: 'Modo loja', area: 'Pequeno comércio', status: 'previa', icon: Store, summary: 'Vendas do dia, estoque baixo e promoções prontas para lojas físicas.', Demo: DemoStore },
  { id: 'saude', title: 'Saúde e relógio', area: 'Pessoal', status: 'previa', icon: HeartPulse, summary: 'Sono, passos e frequência cardíaca do seu smartwatch, com dicas.', Demo: DemoHealth },
  { id: 'bancos', title: 'Bancos e investimentos', area: 'Pessoal', status: 'previa', icon: Landmark, summary: 'Saldos e gastos por Open Finance, só leitura, e ideias informativas.', Demo: DemoBank },
  { id: 'carro', title: 'Carro', area: 'Pessoal', status: 'previa', icon: Car, summary: 'Use o Ayran na central multimídia e receba lembretes do veículo.', Demo: DemoCar },
  { id: 'celular', title: 'App no celular', area: 'Pessoal', status: 'previa', icon: Smartphone, summary: 'Instale na tela inicial e receba notificações.', Demo: DemoMobile },

  { id: 'rag', title: 'Base de conhecimento', area: 'Empresa', status: 'planejado', icon: BrainCircuit, summary: 'A IA aprende com os documentos e a história da empresa.', details: ['Pergunte sobre contratos, manuais e projetos e receba a resposta com a fonte', 'Memória de longo prazo e feedback das pessoas (útil / não útil)', 'Cada empresa tem a sua base, isolada das demais'] },
  { id: 'agente', title: 'Agente de programação', area: 'Empresa', status: 'planejado', icon: Code2, summary: 'Um assistente de código próprio, rodando nos seus modelos.', details: ['Lê o projeto, propõe mudanças e roda testes', 'Integra com o VS Code e com o Git', 'Chaves por pessoa, sem depender de serviços externos'] },
  { id: 'sso', title: 'Login corporativo (SSO)', area: 'Empresa', status: 'planejado', icon: KeyRound, summary: 'Entre com a conta Microsoft, Google ou Okta da empresa.', details: ['Acesso e desligamento centralizados pela TI', 'Papéis e permissões por departamento'] },
  { id: 'tenant', title: 'Uma IA por empresa', area: 'Empresa', status: 'planejado', icon: Building2, summary: 'Marca, persona, módulos e conectores configurados para cada cliente.', details: ['Instalação isolada por cliente ou versão hospedada pela VZ', 'Temas e identidade visual próprios', 'Cobrança por uso e atualizações automáticas'] },
]

export const STATUS_LABEL: Record<Status, string> = { ativo: 'Ativo', previa: 'Prévia', planejado: 'Planejado' }
export const AREAS: Area[] = ['Pessoal', 'Empresa', 'Pequeno comércio']
