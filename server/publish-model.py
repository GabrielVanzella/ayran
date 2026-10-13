"""Libera o modelo "Ayran" (funcao do roteador) pra TODOS os usuarios do Open WebUI.

Sem isso so o admin enxerga o modelo: funcionario comum recebe "Model not found" no chat.
Uso (com a Central e o Open WebUI no ar):  <python do hub-venv> server/publish-model.py
Idempotente: se o modelo ja existe, so garante o acesso publico de leitura.
"""

import json
import urllib.error
import urllib.request

HUB = "http://127.0.0.1:3000/ayran"
OWUI = "http://127.0.0.1:8080"
PUBLIC_READ = [{"principal_type": "user", "principal_id": "*", "permission": "read"}]


def call(url, body=None, token=None, method=None):
    r = urllib.request.Request(
        url, data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})},
        method=method or ("POST" if body is not None else "GET"),
    )
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:300]


token = call(f"{HUB}/api/auto-login", {}, method="POST")[1]["token"]
form = {
    "id": "ayran", "name": "Ayran", "base_model_id": None,
    "meta": {"description": "Assistente da VZ Tecnologia: escolhe sozinho o especialista (conversa, raciocinio ou codigo)."},
    "params": {}, "access_grants": PUBLIC_READ, "is_active": True,
}
status, body = call(f"{OWUI}/api/v1/models/create", form, token)
if status == 200:
    print("modelo Ayran criado e liberado pra todos")
else:
    # ja existe: atualiza o acesso
    status2, body2 = call(f"{OWUI}/api/v1/models/model/update", form, token)
    print("modelo ja existia; acesso atualizado:" if status2 == 200 else f"falhou ({status}/{status2}):", body2 if status2 != 200 else "")
