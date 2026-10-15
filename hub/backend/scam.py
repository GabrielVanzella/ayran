"""Analisador de golpes em e-mail: regras objetivas (cabecalhos, dominio, links, anexos, linguagem).

Nunca abre link nem anexo: so le o texto e os cabecalhos. O resultado e um indicio, nao uma garantia.
"""

import re
from email import message_from_string
from email.utils import parseaddr
from urllib.parse import urlparse

# marca -> dominios oficiais (sufixos)
BRANDS = {
    "banco do brasil": ["bb.com.br"],
    "itau": ["itau.com.br", "itau-unibanco.com.br"],
    "bradesco": ["bradesco.com.br", "bradescoseguros.com.br"],
    "caixa": ["caixa.gov.br"],
    "santander": ["santander.com.br"],
    "nubank": ["nubank.com.br"],
    "inter": ["bancointer.com.br"],
    "mercado livre": ["mercadolivre.com.br", "mercadolivre.com", "mercadopago.com.br"],
    "mercado pago": ["mercadopago.com.br", "mercadopago.com"],
    "receita federal": ["receita.fazenda.gov.br", "gov.br"],
    "correios": ["correios.com.br"],
    "microsoft": ["microsoft.com", "office.com", "microsoftonline.com", "outlook.com"],
    "google": ["google.com", "gmail.com"],
    "paypal": ["paypal.com", "paypal.com.br"],
    "netflix": ["netflix.com"],
    "apple": ["apple.com", "icloud.com"],
    "amazon": ["amazon.com", "amazon.com.br"],
}
SHORTENERS = {"bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "cutt.ly", "rebrand.ly", "shorturl.at"}
RISKY_TLDS = {"zip", "mov", "top", "xyz", "click", "link", "icu", "work", "rest", "monster", "buzz", "cfd", "sbs"}
GOV_TLDS_NOT_REAL = {"org", "net", "info", "com"}
DANGEROUS_EXT = {"exe", "scr", "js", "jse", "vbs", "bat", "cmd", "msi", "iso", "img", "lnk", "jar", "hta", "ps1", "dll"}
OFFICE_MACRO_EXT = {"docm", "xlsm", "pptm"}
ARCHIVE_EXT = {"zip", "rar", "7z"}

URGENCY = [
    r"\bem\s+(?:at[eé]\s+)?\d+\s*(?:h|horas?)\b", r"\bimediatamente\b", r"\burgente\b", r"\b[uú]ltimo aviso\b",
    r"\bser[aá]\s+(?:bloquead|cancelad|suspens|encerrad)", r"\bsua conta (?:ser[aá]|foi|est[aá])\s+(?:bloquead|suspens|limitad)",
    r"\bregularize\b", r"\bagora mesmo\b", r"\bevite (?:o )?bloqueio\b", r"\bprazo\b.{0,20}\bhoje\b",
]
CREDENTIALS = [r"\bsenha\b", r"\bc[oó]digo (?:de )?(?:verifica[cç][aã]o|seguran[cç]a|sms)\b", r"\bconfirm(?:e|ar) (?:seus )?dados\b",
               r"\batualiz(?:e|ar) (?:seus )?dados\b", r"\bcpf\b", r"\bn[uú]mero do cart[aã]o\b", r"\btoken\b", r"\bcvv\b"]
PAYMENT_CHANGE = [r"\bmud(?:amos|ou|ança) (?:de |nossa |a )?(?:conta|dados banc)", r"\bnova conta\b", r"\bboleto\b", r"\bpix\b",
                  r"\bchave pix\b", r"\batualiz(?:amos|ação) (?:nossos )?dados banc", r"\btransfer[eê]ncia\b"]
PRIZE = [r"\bvoc[eê] (?:ganhou|foi sorteado|foi selecionado)\b", r"\bpr[eê]mio\b", r"\bherança\b", r"\bretire seu\b"]
IMPERSONATION_GOV = [r"receita federal", r"\bserasa\b", r"\bdetran\b", r"\bpolícia federal\b", r"\binss\b", r"\bgov\.br\b"]

URL_RE = re.compile(r"https?://[^\s<>\"')\]]+", re.I)
HREF_RE = re.compile(r"""<a\s[^>]*href=["']([^"']+)["'][^>]*>(.*?)</a>""", re.I | re.S)


def _domain(addr: str) -> str:
    return addr.rsplit("@", 1)[-1].lower().strip(">") if "@" in addr else ""


def _host(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""


def _registrable(host: str) -> str:
    """Dominio 'registravel' aproximado: ultimos 2 rotulos, ou 3 quando termina em com.br, org.br etc."""
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in ("com", "org", "net", "gov", "edu") and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:])


def _is_official(host: str, domains: list[str]) -> bool:
    return any(host == d or host.endswith("." + d) for d in domains)


def _count(patterns: list[str], text: str) -> int:
    return sum(1 for p in patterns if re.search(p, text, re.I))


def parse(raw: str) -> dict:
    """Aceita .eml completo ou so o texto colado (com ou sem 'De:' / 'Assunto:')."""
    msg = message_from_string(raw)
    headers = {k.lower(): str(v) for k, v in msg.items()}
    body = ""
    attachments: list[str] = [str(a) for a in (msg.get_all("x-attachment") or [])]  # nomes ja extraidos por quem entregou o e-mail
    if msg.is_multipart():
        for part in msg.walk():
            fn = part.get_filename()
            if fn:
                attachments.append(fn)
            elif part.get_content_type() in ("text/plain", "text/html") and not body:
                payload = part.get_payload(decode=True)
                if payload:
                    body = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    else:
        payload = msg.get_payload(decode=True)
        body = payload.decode(msg.get_content_charset() or "utf-8", errors="replace") if payload else str(msg.get_payload())
    # texto colado "De: ... / Assunto: ..." nao vira cabecalho MIME
    if "from" not in headers:
        m = re.search(r"^(?:de|from)\s*:\s*(.+)$", raw, re.I | re.M)
        if m:
            headers["from"] = m.group(1).strip()
        m = re.search(r"^(?:assunto|subject)\s*:\s*(.+)$", raw, re.I | re.M)
        if m:
            headers["subject"] = m.group(1).strip()
        m = re.search(r"^(?:responder para|reply-to)\s*:\s*(.+)$", raw, re.I | re.M)
        if m:
            headers["reply-to"] = m.group(1).strip()
        body = raw
    return {"headers": headers, "body": body, "attachments": attachments}


def analyze(raw: str) -> dict:
    p = parse(raw)
    h, body = p["headers"], p["body"]
    subject = h.get("subject", "")
    text = f"{subject}\n{body}"
    low = text.lower()
    from_name, from_addr = parseaddr(h.get("from", ""))
    from_dom = _domain(from_addr)
    findings: list[tuple[int, str, str]] = []  # (pontos, tom, motivo)

    def add(points: int, tone: str, reason: str):
        findings.append((points, tone, reason))

    # ---- autenticacao (so quando o cabecalho existe) ----
    auth = h.get("authentication-results", "").lower()
    for proto in ("spf", "dkim", "dmarc"):
        m = re.search(rf"{proto}=(\w+)", auth)
        if m and m.group(1) in ("fail", "softfail", "permerror", "none"):
            add(25 if m.group(1) in ("fail", "permerror") else 12, "bad", f"Falha na verificação {proto.upper()}: o remetente pode não ser quem diz ser")

    # ---- remetente ----
    reply_to = parseaddr(h.get("reply-to", ""))[1]
    if reply_to and _domain(reply_to) != from_dom:
        add(15, "warn", f"O endereço de resposta ({_domain(reply_to)}) é diferente do remetente ({from_dom})")
    ret = parseaddr(h.get("return-path", ""))[1]
    if ret and from_dom and _domain(ret) != from_dom and not (_domain(ret).endswith(from_dom) or from_dom.endswith(_domain(ret))):
        add(8, "warn", "O caminho de retorno é de outro domínio")

    # marca citada x dominio real
    named = [b for b in BRANDS if b in (from_name + " " + subject + " " + body[:600]).lower()]
    for brand in named:
        official = BRANDS[brand]
        if from_dom and not _is_official(from_dom, official):
            add(35, "bad", f"Diz ser “{brand.title()}”, mas o e-mail vem de “{from_dom}”, que não é um domínio oficial")
            break
    if from_dom:
        label = from_dom.split(".")[0]
        for brand, official in BRANDS.items():
            token = brand.replace(" ", "")
            if token in label.replace("-", "") and not _is_official(from_dom, official):
                add(20, "bad", f"O domínio “{from_dom}” imita “{brand.title()}”")
                break
        if from_dom.startswith("xn--") or "xn--" in from_dom:
            add(20, "bad", "Domínio com caracteres disfarçados (punycode)")
        tld = from_dom.rsplit(".", 1)[-1]
        if tld in RISKY_TLDS:
            add(10, "warn", f"Domínio com final “.{tld}”, muito usado em golpes")
        if re.search(r"(?:gov|receita|serasa|detran|inss)", from_dom) and tld in GOV_TLDS_NOT_REAL and not from_dom.endswith("gov.br"):
            add(25, "bad", "Imita um órgão do governo, mas não termina em .gov.br")
    if any(re.search(p, low) for p in IMPERSONATION_GOV) and not (from_dom.endswith("gov.br")):
        add(20, "bad", "Cita órgão do governo, mas não vem de um endereço .gov.br (órgãos não cobram por e-mail)")

    # ---- links ----
    urls = URL_RE.findall(text)
    mism = False
    for href, shown in HREF_RE.findall(body):
        shown_txt = re.sub(r"<[^>]+>", "", shown).strip()
        sm = URL_RE.search(shown_txt) or re.search(r"\b(?:[\w-]+\.)+[a-z]{2,}\b", shown_txt)
        if sm:
            shown_host = _host(sm.group(0)) or sm.group(0).lower()
            real_host = _host(href)
            if real_host and shown_host and not (real_host.endswith(shown_host) or shown_host.endswith(real_host)):
                mism = True
    # texto colado: ancora "texto (link)" nao existe, entao compara a marca com os links
    hosts = {_host(u) for u in urls if _host(u)}
    if mism:
        add(30, "bad", "O link exibido leva a um endereço diferente do que aparece no texto")
    for host in hosts:
        if host in SHORTENERS:
            add(10, "warn", f"Link encurtado ({host}): não dá para ver o destino")
        if re.fullmatch(r"\d{1,3}(?:\.\d{1,3}){3}", host):
            add(25, "bad", "Link aponta para um número de IP, e não para um site")
        if host.rsplit(".", 1)[-1] in RISKY_TLDS:
            add(10, "warn", f"Link para domínio “{host}”, de final pouco confiável")
        if "xn--" in host:
            add(15, "bad", "Link com domínio disfarçado (punycode)")
    # dominio do remetente que parece variacao do site do link (ex.: banco-atualiza.com x banco.com.br)
    for host in hosts:
        base, sender_base = _registrable(host), _registrable(from_dom)
        label = base.split(".")[0]
        if from_dom and len(label) >= 5 and base != sender_base and label in sender_base.replace("-", "") .replace(".", ""):
            add(25, "bad", f"O domínio do remetente (“{from_dom}”) parece uma variação do site do link (“{host}”)")
            break
    for brand in named:
        official = BRANDS[brand]
        for host in hosts:
            if brand.replace(" ", "") in host.replace("-", "").replace(".", "") and not _is_official(host, official):
                add(30, "bad", f"Link usa o nome “{brand.title()}” em um endereço que não é o oficial ({host})")
                break
    if hosts and from_dom and not any(from_dom.endswith(x) or x.endswith(from_dom) for x in hosts) and len(hosts) == 1 and from_dom not in ("gmail.com", "outlook.com", "hotmail.com"):
        only = next(iter(hosts))
        if only.split(".")[-2:] != from_dom.split(".")[-2:] and any(b in only for b in ("login", "secure", "verify", "conta", "atualiz", "confirm")):
            add(15, "warn", f"O link leva a “{only}”, diferente do remetente")

    # ---- anexos ----
    exts = [a.rsplit(".", 1)[-1].lower() for a in p["attachments"] if "." in a]
    for a in p["attachments"]:
        e = a.rsplit(".", 1)[-1].lower() if "." in a else ""
        if e in DANGEROUS_EXT:
            add(40, "bad", f"Anexo executável ou perigoso: {a}")
        elif e in OFFICE_MACRO_EXT:
            add(20, "warn", f"Anexo do Office com macros: {a}")
        elif e in ARCHIVE_EXT:
            add(12, "warn", f"Anexo compactado: {a}")
        elif re.search(r"\.(pdf|docx?|xlsx?)\.(exe|scr|js|zip)$", a.lower()):
            add(40, "bad", f"Anexo com extensão dupla: {a}")
    if re.search(r"\.(zip|rar|7z)\b.{0,60}\bsenha\b|\bsenha\b.{0,60}\.(zip|rar|7z)", low) or ("senha" in low and exts and any(e in ARCHIVE_EXT for e in exts)):
        add(15, "bad", "Anexo compactado protegido por senha, um jeito comum de escapar de antivírus")
    m = re.search(r"\b(?:anexo|arquivo)\s+([\w\-. ]+\.(?:zip|rar|7z|exe|scr|js|html?))\b", low)
    if m and not p["attachments"]:
        add(12, "warn", f"Menciona um arquivo perigoso ({m.group(1)})")

    # ---- linguagem ----
    urg = _count(URGENCY, low)
    if urg:
        add(min(20, 8 + 6 * urg), "bad" if urg >= 2 else "warn", "Urgência ou ameaça para você agir sem pensar")
    cred = _count(CREDENTIALS, low)
    if cred and (hosts or urg):
        add(min(25, 10 + 8 * cred), "bad", "Pede dados pessoais, senha ou código")
    pay = _count(PAYMENT_CHANGE, low)
    if pay >= 2 or (re.search(r"mud(?:amos|ou|ança).{0,25}conta|nova conta", low) and pay >= 1):
        add(28, "bad", "Pedido de pagamento com mudança de conta, padrão do golpe do fornecedor/boleto falso")
    if _count(PRIZE, low):
        add(15, "warn", "Promete prêmio ou benefício inesperado")
    if re.search(r"prezado (?:cliente|usu[aá]rio)|caro (?:cliente|usu[aá]rio)|dear customer", low):
        add(6, "warn", "Saudação genérica (“prezado cliente”), em vez do seu nome")

    # ---- sinais de confianca ----
    if auth and all(re.search(rf"{x}=pass", auth) for x in ("spf", "dkim")):
        add(-15, "ok", "SPF e DKIM aprovados")

    score = max(0, min(100, sum(f[0] for f in findings)))
    if score >= 60:
        verdict, label = "bad", "Provável golpe"
    elif score >= 25:
        verdict, label = "warn", "Suspeito"
    else:
        verdict, label = "ok", "Parece seguro"

    reasons = [r for pts, tone, r in sorted(findings, key=lambda f: -abs(f[0])) if tone != "ok"]
    positives = [r for pts, tone, r in findings if tone == "ok"]
    if verdict == "ok" and not reasons:
        reasons = ["Não encontrei sinais de golpe no texto, nos links e nos anexos"]
    actions = {
        "bad": "Não clique em links nem abra anexos. Se tiver dúvida, entre em contato com a empresa pelo telefone ou site oficial, digitando o endereço você mesmo.",
        "warn": "Confirme por outro canal (telefone ou mensagem) antes de pagar, clicar ou responder.",
        "ok": "Mesmo assim, desconfie de pedidos inesperados de dinheiro ou de dados.",
    }
    return {
        "verdict": verdict,
        "label": label,
        "score": score,
        "reasons": reasons[:8],
        "positives": positives,
        "action": actions[verdict],
        "from": from_addr,
        "subject": subject,
    }
