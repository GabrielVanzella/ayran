"""Dados de exemplo para a demonstracao do prototipo (e-mails, agenda e sinais de negocio).

Sao ficticios. Cada e-mail traz o texto bruto; o veredito vem do analisador real (scam.analyze).
"""

from datetime import datetime, timedelta

# (remetente, assunto, corpo, cabecalhos extras, anexos, minutos atras)
# Corpo em texto puro; cabecalhos simulam o que um servidor de e-mail entregaria.
MAILS: list[dict] = [
    {
        "from": "Marina Souza <marina@clienteabc.com.br>",
        "subject": "Aprovação da proposta e próximos passos",
        "body": "Oi Gabriel, tudo bem?\n\nConversamos aqui e aprovamos a proposta do portal. Podemos começar na segunda-feira? Preciso do contrato revisado até sexta para a diretoria assinar.\n\nObrigada,\nMarina",
        "auth": "spf=pass dkim=pass dmarc=pass",
        "minutes_ago": 22,
    },
    {
        "from": "Banco Seguro <suporte@bancoseguro-atualiza.com>",
        "subject": "Sua conta será bloqueada em 24h",
        "body": "Prezado cliente,\n\nDetectamos acesso suspeito na sua conta. Para evitar o bloqueio imediatamente, confirme seus dados e senha agora no link abaixo:\n\nhttp://bancoseguro-atualiza.com/confirmar\n\nBanco Seguro",
        "auth": "spf=fail dkim=none dmarc=fail",
        "minutes_ago": 47,
    },
    {
        "from": "Douglas <douglas@vztecnologia.com.br>",
        "subject": "PR do módulo de agenda pronto para revisão",
        "body": "Gabriel, abri o PR do módulo de agenda. Rodei os testes e passou tudo. Dá uma olhada quando puder?",
        "auth": "spf=pass dkim=pass dmarc=pass",
        "minutes_ago": 90,
    },
    {
        "from": "Financeiro Fornecedor XYZ <financeiro@fornecedorxyz.net>",
        "subject": "Mudamos nossa conta bancária — pague este boleto",
        "body": "Prezado cliente,\n\nAtualizamos nossos dados bancários. Por favor, a partir de hoje faça o pagamento do boleto em anexo na nova conta. O PIX também mudou: chave nova no PDF.\n\nAtenciosamente,\nFinanceiro",
        "reply_to": "pagamentos@fornecedorxyz-cobranca.top",
        "auth": "spf=softfail dkim=none dmarc=none",
        "attachments": ["boleto_outubro.pdf.zip"],
        "minutes_ago": 150,
    },
    {
        "from": "Microsoft 365 <no-reply@microsoft.com>",
        "subject": "Sua fatura de outubro está disponível",
        "body": "Olá,\n\nA fatura de outubro do seu Microsoft 365 Business Basic já está disponível no centro de administração.\n\nhttps://admin.microsoft.com/billing\n\nMicrosoft",
        "auth": "spf=pass dkim=pass dmarc=pass",
        "minutes_ago": 300,
    },
    {
        "from": "Receita Federal <contato@receita-regularize.org>",
        "subject": "Pendência no seu CPF — regularize agora",
        "body": "Receita Federal informa: existe uma pendência no CPF do contribuinte. Regularize hoje para evitar bloqueio e multa. Acesse o anexo e informe seus dados.",
        "auth": "spf=fail dkim=fail dmarc=fail",
        "attachments": ["regularizacao.zip"],
        "minutes_ago": 420,
    },
]

# e-mails que "chegam" durante a demonstracao (um por vez, em ordem)
INCOMING: list[dict] = [
    {
        "from": "Itaú Segurança <alerta@itau-seguranca-app.xyz>",
        "subject": "Compra recusada — confirme agora para liberar seu cartão",
        "body": "Prezado cliente,\n\nUma compra de R$ 4.890,00 foi recusada no seu cartão. Para liberar imediatamente, informe seu CPF, senha e o código de verificação no link:\n\nhttp://bit.ly/3itau-libera\n\nItaú",
        "auth": "spf=fail dkim=none dmarc=fail",
        "minutes_ago": 0,
    },
    {
        "from": "Rafael Lima <rafael@lojaparceira.com.br>",
        "subject": "Orçamento do site novo — podemos conversar amanhã?",
        "body": "Oi Gabriel, vi o portfólio da VZ e gostaria de um orçamento para um site com loja virtual. Você teria 30 minutos amanhã às 15h para uma conversa rápida?\n\nAbraço,\nRafael",
        "auth": "spf=pass dkim=pass dmarc=pass",
        "minutes_ago": 0,
    },
]


def raw_email(m: dict) -> str:
    """Monta o texto bruto (cabecalhos + corpo) que o analisador consome."""
    lines = [f"From: {m['from']}", f"Subject: {m['subject']}"]
    if m.get("reply_to"):
        lines.append(f"Reply-To: {m['reply_to']}")
    if m.get("auth"):
        lines.append(f"Authentication-Results: mx.vztecnologia.com.br; {m['auth']}")
    for a in m.get("attachments", []):
        lines.append(f"X-Attachment: {a}")
    return "\n".join(lines) + "\n\n" + m["body"]


def agenda_for(today: datetime) -> list[dict]:
    d = today.replace(hour=0, minute=0, second=0, microsecond=0)

    def at(day_offset: int, h: int, mi: int = 0, minutes: int = 60):
        s = d + timedelta(days=day_offset, hours=h, minutes=mi)
        return s.strftime("%Y-%m-%dT%H:%M"), (s + timedelta(minutes=minutes)).strftime("%Y-%m-%dT%H:%M")

    items = [
        ("Daily com a equipe", at(0, 9, 0, 15), "Teams", ""),
        ("Reunião com Cliente ABC — proposta", at(0, 10, 30, 60), "Google Meet", "Levar o escopo do portal e a estimativa"),
        ("Revisar contrato do cliente", at(0, 14, 0, 60), "", "Marina precisa até sexta"),
        ("Ligação com fornecedor", at(0, 14, 30, 30), "Telefone", "Confirmar a mudança de conta por telefone"),
        ("Fechamento da semana", at(0, 17, 0, 30), "", ""),
        ("Conversa com Rafael — orçamento do site", at(1, 15, 0, 30), "Google Meet", ""),
        ("Apresentar o protótipo do Ayran", at(2, 11, 0, 60), "Sala de reunião", "Mostrar a Central, a voz e o modo oficina"),
    ]
    return [{"title": t, "start": s, "end": e, "place": p, "notes": n} for t, (s, e), p, n in items]
