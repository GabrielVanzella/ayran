"""Redefine a senha do admin do Open WebUI e salva as credenciais em $AYRAN_HOME/local-admin.json
(fora do repo), usado pelo login automatico da central neste PC.

Uso: <venv do Open WebUI>\\Scripts\\python.exe -I server\\reset-admin-password.py
"""

import json
import os
import secrets
import shutil
import sqlite3
import time
from pathlib import Path

import bcrypt

ayran_home = Path(os.environ.get("AYRAN_HOME", Path.home() / "ayran-server"))
db_path = ayran_home / "data" / "webui.db"
backup = ayran_home / "backup" / f"webui.db.{int(time.time())}.bak"
backup.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(db_path, backup)

db = sqlite3.connect(db_path)
row = db.execute("select id, email from user where role = 'admin' order by created_at limit 1").fetchone()
if not row:
    raise SystemExit("Nenhum admin cadastrado.")
user_id, email = row

password = secrets.token_urlsafe(12)
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
n = db.execute("update auth set password = ? where id = ?", (hashed, user_id)).rowcount
db.commit()
if n != 1:
    raise SystemExit("Nao achei o registro de autenticacao do admin.")

creds = ayran_home / "local-admin.json"
creds.write_text(json.dumps({"email": email, "password": password}, indent=2), encoding="utf-8")
print(f"Senha redefinida para {email}")
print(f"Credenciais salvas em {creds}")
print(f"Backup do banco: {backup}")
