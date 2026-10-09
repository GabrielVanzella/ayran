"""Fontes de noticias da central, por tema. Falha de um feed nao derruba os outros."""

GN = "https://news.google.com/rss/search?hl=pt-BR&gl=BR&ceid=BR:pt-419&q="

TOPICS = {
    "ia": {
        "label": "IA",
        "feeds": [
            GN + "intelig%C3%AAncia+artificial+when:2d",
            GN + "LLM+OR+OpenAI+OR+Anthropic+OR+Gemini+OR+Qwen+when:2d",
        ],
    },
    "tech": {
        "label": "Tecnologia / dev",
        "feeds": [
            GN + "tecnologia+desenvolvimento+software+when:2d",
            "https://www.tabnews.com.br/recentes/rss",
            "https://hnrss.org/frontpage",
        ],
    },
    "negocios": {
        "label": "Negócios",
        "feeds": [
            GN + "empreendedorismo+OR+startups+OR+neg%C3%B3cios+when:2d",
            GN + "software+house+OR+mercado+de+TI+when:7d",
        ],
    },
    "brasil": {
        "label": "Brasil",
        "feeds": [
            "https://news.google.com/rss?hl=pt-BR&gl=BR&ceid=BR:pt-419",
            "https://g1.globo.com/rss/g1/",
        ],
    },
}
